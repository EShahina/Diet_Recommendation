import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from 'resend';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

// Lazy initiators for SDK clients to protect against startup crashes if keys are empty/invalid
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.trim() || apiKey.startsWith('YOUR_')) {
    return null;
  }
  try {
    return new Resend(apiKey);
  } catch (err) {
    console.error("Failed to initialize Resend client:", err);
    return null;
  }
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !sid.trim() || !sid.startsWith('AC')) {
    return null;
  }
  try {
    return twilio(sid, token);
  } catch (err) {
    console.error("Failed to initialize Twilio client:", err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.post("/api/send-sms", async (req, res) => {
    const { phone, message, userName } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    console.log(`[REAL-TIME SMS ALERT] Sending SMS to ${phone} for user ${userName}`);
    console.log(`Message: ${message}`);

    try {
      const twilioClient = getTwilioClient();
      if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
        console.warn("Twilio credentials or phone number not found or invalid. Simulating SMS send...");
        return res.json({ 
          success: true, 
          simulated: true, 
          message: "SMS simulated (Twilio config missing or invalid)",
          debug: {
            to: phone,
            body: message
          }
        });
      }

      const result = await twilioClient.messages.create({
        body: message.startsWith('🚨') ? message : `🚨 NeuroPlate Alert: ${message}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });

      res.json({ success: true, sid: result.sid });
    } catch (err: any) {
      console.error("Twilio Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/send-diet-plan-sms", async (req, res) => {
    const { phone, planTitle, userName, schedule } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    if (!Array.isArray(schedule)) {
      console.error("Invalid schedule format received:", schedule);
      return res.status(400).json({ error: "Invalid schedule format" });
    }

    try {
      const scheduleSummary = schedule.map((day: any) => {
        const b = day.meals?.breakfast?.main || 'N/A';
        const l = day.meals?.lunch?.main || 'N/A';
        const d = day.meals?.dinner?.main || 'N/A';
        return `${day.day}: B:${b}, L:${l}, D:${d}`;
      }).join('\n');

      const message = `Hello ${userName}! Your personalized diet plan "${planTitle}" is ready.\n\nSummary:\n${scheduleSummary}\n\nStay disciplined!`;

      console.log(`[DIET PLAN SMS] Sending plan to ${phone} for user ${userName}`);

      const twilioClient = getTwilioClient();
      if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
        console.warn("Twilio credentials or phone number not found or invalid. Simulating Diet Plan SMS send...");
        return res.json({ 
          success: true, 
          simulated: true, 
          message: "Diet Plan SMS simulated (Twilio config missing or invalid)" 
        });
      }

      const result = await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });

      res.json({ success: true, sid: result.sid });
    } catch (err: any) {
      console.error("SMS Construction or Twilio Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/send-voice-mail", async (req, res) => {
    const { email, message, audioBase64, userName } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log(`[REAL-TIME ALERT] Sending voice mail to ${email} for user ${userName}`);
    console.log(`Message: ${message}`);

    const resendClient = getResendClient();
    if (!resendClient) {
      console.warn("RESEND_API_KEY not found or invalid. Simulating email send...");
      return res.json({ 
        success: true, 
        simulated: true, 
        message: "Email simulated (RESEND_API_KEY missing or invalid)" 
      });
    }

    try {
      const { data, error } = await resendClient.emails.send({
        from: 'NeuroPlate Coach <onboarding@resend.dev>',
        to: [email],
        subject: `🚨 NeuroPlate Alert: Missed Meal Nudge for ${userName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #334155;">
            <h2 style="color: #10b981;">NeuroPlate Discipline Alert</h2>
            <p>Hello <strong>${userName}</strong>,</p>
            <p>Our AI coach noticed you missed a meal log. Consistency is the foundation of neurological discipline.</p>
            <div style="background: #f1f5f9; padding: 15px; border-radius: 10px; border-left: 4px solid #10b981; margin: 20px 0;">
              <p style="margin: 0; font-style: italic;">"${message}"</p>
            </div>
            <p>Please return to the app to log your meal and maintain your score.</p>
            <a href="${process.env.APP_URL || '#'}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px;">Open NeuroPlate</a>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">This is an automated real-time nudge from your NeuroPlate Diet AI.</p>
          </div>
        `,
        attachments: audioBase64 ? [
          {
            filename: 'voice-nudge.wav',
            content: audioBase64,
          },
        ] : [],
      });

      if (error) {
        console.error("Resend Error:", error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, data });
    } catch (err: any) {
      console.error("Server Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
