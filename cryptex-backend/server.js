import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

const port = process.env.PORT || 3000;
const moonpayPublicKey = process.env.MOONPAY_PUBLIC_KEY || "";
const moonpayWidgetUrl = process.env.MOONPAY_WIDGET_URL || "https://buy-sandbox.moonpay.com";

if (!moonpayPublicKey) {
  console.warn("Warning: MOONPAY_PUBLIC_KEY is not set. Create a .env file before use.");
}

function buildMoonpayUrl(amount, walletAddress, currencyCode = "ETH", baseCurrencyCode = "BRL") {
  const url = new URL(moonpayWidgetUrl);
  url.searchParams.set("apiKey", moonpayPublicKey);
  url.searchParams.set("currencyCode", currencyCode);
  url.searchParams.set("baseCurrencyCode", baseCurrencyCode);
  url.searchParams.set("baseCurrencyAmount", amount.toFixed(2));
  url.searchParams.set("walletAddress", walletAddress);
  url.searchParams.set("defaultPaymentMethod", "PIX");
  return url.toString();
}

app.get("/moonpay/url", (req, res) => {
  const amount = parseFloat(req.query.amount);
  const walletAddress = (req.query.walletAddress || "").trim();
  const currencyCode = (req.query.currency || "ETH").toUpperCase();

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Valor inválido" });
  }

  if (!walletAddress) {
    return res.status(400).json({ error: "Endereço de carteira inválido" });
  }

  if (!moonpayPublicKey) {
    return res.status(500).json({ error: "Chave pública MoonPay não configurada" });
  }

  return res.json({ url: buildMoonpayUrl(amount, walletAddress, currencyCode) });
});

app.get("/moonpay/open", (req, res) => {
  const amount = parseFloat(req.query.amount);
  const walletAddress = (req.query.walletAddress || "").trim();

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Valor inválido" });
  }

  if (!walletAddress) {
    return res.status(400).json({ error: "Endereço de carteira inválido" });
  }

  if (!moonpayPublicKey) {
    return res.status(500).json({ error: "Chave pública MoonPay não configurada" });
  }

  return res.redirect(buildMoonpayUrl(amount, walletAddress));
});

app.get("/moonpay/config", (_req, res) => {
  return res.json({ widgetUrl: moonpayWidgetUrl });
});

app.post("/moonpay/transaction", async (req, res) => {
  const { baseCurrencyAmount, currencyCode = "BRL", walletAddress } = req.body || {};

  if (!baseCurrencyAmount || !walletAddress) {
    return res.status(400).json({ error: "Parâmetros inválidos" });
  }

  const secret = process.env.MOONPAY_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "MOONPAY_SECRET_KEY não configurada" });
  }

  try {
    const resp = await fetch("https://api.moonpay.io/v3/transactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ baseCurrencyAmount, currencyCode, walletAddress }),
    });

    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/moonpay/webhook", (req, res) => {
  const signature = req.get("x-moonpay-signature") || req.get("x-signature") || req.get("x-mp-signature");
  const webhookKey = process.env.MOONPAY_WEBHOOK_KEY;

  if (!webhookKey) {
    return res.status(500).json({ error: "MOONPAY_WEBHOOK_KEY não configurada" });
  }

  if (!signature) {
    console.warn("Webhook recebido sem header de assinatura");
    return res.status(400).json({ error: "Assinatura ausente" });
  }

  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const hmac = crypto.createHmac("sha256", webhookKey).update(raw).digest("hex");

  if (hmac !== signature) {
    console.warn("Assinatura de webhook inválida", { expected: hmac, received: signature });
    return res.status(400).json({ error: "Assinatura inválida" });
  }

  // Process webhook payload here
  console.log("Webhook MoonPay válido:", req.body);
  return res.status(200).json({ received: true });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontFile = path.join(__dirname, "CRYPTEX.html");

app.get("/", (_req, res) => {
  return res.sendFile(frontFile);
});

app.get("/cryptex.html", (_req, res) => {
  return res.sendFile(frontFile);
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`MoonPay backend running on http://localhost:${port}`);
});
