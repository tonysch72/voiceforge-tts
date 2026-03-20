import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// Load Firebase Config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

// Initialize Global Stats
async function initStats(retries = 5) {
  try {
    const statsRef = db.collection("stats").doc("global");
    const statsDoc = await statsRef.get();

    if (!statsDoc.exists) {
      await statsRef.set({
        founder_monthly_count: 0,
        founder_yearly_count: 0,
      });
    } else {
      const data = statsDoc.data();
      if (
        data &&
        data.founder_count !== undefined &&
        (data.founder_monthly_count === undefined ||
          data.founder_yearly_count === undefined)
      ) {
        await statsRef.update({
          founder_monthly_count: data.founder_monthly_count || 0,
          founder_yearly_count: data.founder_yearly_count || 0,
        });
      }
    }
  } catch (error: any) {
    if (
      retries > 0 &&
      (error.code === 5 || error.message.includes("NOT_FOUND"))
    ) {
      console.log(`Retrying initStats... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return initStats(retries - 1);
    }
    console.error("Failed to initialize stats:", error);
  }
}
initStats().catch(console.error);

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16" as any,
});

async function startServer() {
  const app = express();

  // ✅ FIXED PORT (THIS WAS YOUR MAIN ISSUE)
  const PORT = process.env.PORT || 3000;

  // Webhook BEFORE json middleware
  app.post(
    "/api/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"] as string;
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET || ""
        );
      } catch (err: any) {
        console.error("Webhook Signature Error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === "invoice.paid") {
        const session = event.data.object as any;
        const customerId = session.customer;

        const usersSnapshot = await db
          .collection("users")
          .where("stripe_customer_id", "==", customerId)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          await userDoc.ref.update({
            generations_used: 0,
            subscription_status: "active",
          });
        }
      }

      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object as any;
        const customerId = invoice.customer;

        const usersSnapshot = await db
          .collection("users")
          .where("stripe_customer_id", "==", customerId)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          await userDoc.ref.update({
            subscription_status: "past_due",
          });
        }
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        const userId = session.metadata.userId;
        const planType = session.metadata.planType;

        if (userId && planType) {
          const userRef = db.collection("users").doc(userId);

          await userRef.update({
            plan: planType,
            generation_limit: 500,
            subscription_status: "active",
            last_reset: new Date().toISOString(),
          });

          const statsRef = db.collection("stats").doc("global");
          const counterField =
            planType === "founder_monthly"
              ? "founder_monthly_count"
              : "founder_yearly_count";

          await statsRef.update({
            [counterField]: admin.firestore.FieldValue.increment(1),
          });
        }
      }

      res.json({ received: true });
    }
  );

  app.use(express.json());

  // Simple test route (helps debugging)
  app.get("/health", (req, res) => {
    res.send("OK");
  });

  // Vite handling
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ✅ FIXED LISTEN
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
