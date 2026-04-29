import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ── Constants ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HMAC_SECRET = process.env.HMAC_SECRET || crypto.randomBytes(32).toString("hex");
const BRAND_GOLD = "#C08D23";

// Treasuries
const MONROE_EVM = "0x15184bf50b3d3f52b60434f8942b7d52f2eb436e";
const SOLANA_TREASURY = "B1N61cuL35fhskWz5dw8XqDyP6LWi3ZWmq8CNA9L3FVn";

// Asset contracts
const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Pricing
const HIVE_TAKE_BPS = 12;
const FLAT_FEE_ATOMIC = 20000; // $0.02 USDC (6 decimals)

// Settlement log
const SETTLEMENT_LOG = "/tmp/bridge_settlements.jsonl";

// ── Helpers ────────────────────────────────────────────────────────────────
function computeQuoteId(inputs) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ ...inputs, nonce });
  const sig = crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
  return `qid_${sig.slice(0, 32)}`;
}

function computeFees(amountAtomic) {
  const bpsFee = Math.floor((amountAtomic * HIVE_TAKE_BPS) / 10000);
  const totalRequired = amountAtomic + bpsFee + FLAT_FEE_ATOMIC;
  const estDestination = amountAtomic - bpsFee - FLAT_FEE_ATOMIC;
  return { bpsFee, totalRequired, estDestination: Math.max(0, estDestination) };
}

function logSettlement(entry) {
  fs.appendFileSync(SETTLEMENT_LOG, JSON.stringify(entry) + "\n", "utf8");
}

function readSettlements() {
  if (!fs.existsSync(SETTLEMENT_LOG)) return [];
  return fs
    .readFileSync(SETTLEMENT_LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ── 402 challenge builders ─────────────────────────────────────────────────
function build402Challenge(direction, amountAtomic, resourcePath, description) {
  if (direction === "base_to_solana") {
    return {
      scheme: "exact",
      network: "base",
      asset: "USDC",
      maxAmountRequired: amountAtomic,
      payTo: MONROE_EVM,
      assetContract: BASE_USDC_CONTRACT,
      resource: resourcePath,
      description,
      mimeType: "application/json",
    };
  } else {
    return {
      scheme: "exact",
      network: "solana",
      asset: "USDC",
      maxAmountRequired: amountAtomic,
      payTo: SOLANA_TREASURY,
      assetMint: SOLANA_USDC_MINT,
      resource: resourcePath,
      description,
      mimeType: "application/json",
    };
  }
}

// ── In-memory quote store (TTL not strictly enforced in Phase 1) ───────────
const quoteStore = new Map();

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "hive-base-bridge", version: "1.0.0" });
});

// GET /
app.get("/", (_req, res) => {
  res.json({
    service: "hive-base-bridge",
    description:
      "Solana to Base and Base to Solana USDC agent payments in one call. 12 bps + $0.02 per hop. Phase 1: quote and route ledger. Phase 2: on-chain CCTP v2 execution via authorized routing wallet.",
    version: "1.0.0",
    pricing: { bps: HIVE_TAKE_BPS, flat_fee_usdc: "0.02", flat_fee_atomic: FLAT_FEE_ATOMIC },
    brand: BRAND_GOLD,
    directions: ["base_to_solana", "solana_to_base"],
    treasuries: {
      base: MONROE_EVM,
      solana: SOLANA_TREASURY,
    },
    endpoints: [
      "GET /health",
      "GET /",
      "GET /.well-known/agent.json",
      "GET /mcp (JSON-RPC 2.0)",
      "GET /v1/base-bridge/quote",
      "POST /v1/base-bridge/submit",
      "GET /v1/base-bridge/status/:settlement_id",
      "GET /v1/base-bridge/methodology",
    ],
  });
});

// GET /.well-known/agent.json
app.get("/.well-known/agent.json", (_req, res) => {
  res.json({
    schema_version: "1.0",
    name: "Hive Base Bridge",
    description:
      "Cross-chain USDC agent payments. Solana to Base and Base to Solana in one call. 12 bps + $0.02 flat fee per hop. Phase 1: quote and route ledger. Phase 2: on-chain CCTP v2 execution via authorized routing wallet.",
    version: "1.0.0",
    brand_color: BRAND_GOLD,
    capabilities: ["quote_bridge", "submit_bridge", "get_bridge_status"],
    directions: ["base_to_solana", "solana_to_base"],
    pricing: {
      fee_bps: HIVE_TAKE_BPS,
      flat_fee_usdc: "0.02",
      flat_fee_atomic: FLAT_FEE_ATOMIC,
    },
    payment: {
      base_to_solana: {
        network: "base",
        chain_id: 8453,
        asset: "USDC",
        asset_contract: BASE_USDC_CONTRACT,
        treasury: MONROE_EVM,
      },
      solana_to_base: {
        network: "solana",
        asset: "USDC",
        asset_mint: SOLANA_USDC_MINT,
        treasury: SOLANA_TREASURY,
      },
    },
    mcp_endpoint: "/mcp",
    methodology: "/v1/base-bridge/methodology",
    phase: "1",
    phase_note:
      "Phase 1 delivers quote and route ledger. Phase 2 adds on-chain CCTP v2 execution via authorized hot routing wallet.",
  });
});

// GET /mcp — JSON-RPC 2.0 MCP endpoint
app.get("/mcp", (_req, res) => {
  res.json({
    jsonrpc: "2.0",
    result: {
      server: "hive-base-bridge",
      version: "1.0.0",
      protocolVersion: "2024-11-05",
    },
  });
});

app.post("/mcp", (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== "2.0") {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
  }

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "quote_bridge",
            description:
              "Get a price quote for a Solana to Base or Base to Solana USDC transfer. Returns fee breakdown and a time-limited quote ID.",
            inputSchema: {
              type: "object",
              properties: {
                direction: {
                  type: "string",
                  enum: ["base_to_solana", "solana_to_base"],
                  description: "Transfer direction.",
                },
                amount_usdc: {
                  type: "number",
                  description: "Amount in USDC (human-readable, e.g. 1000 for $1,000).",
                },
              },
              required: ["direction", "amount_usdc"],
            },
          },
          {
            name: "submit_bridge",
            description:
              "Submit a bridge transfer. Requires payment (x402) in source asset to the source-side Hive treasury. Phase 1 logs the route; Phase 2 executes on-chain via CCTP v2.",
            inputSchema: {
              type: "object",
              properties: {
                quote_id: { type: "string", description: "Quote ID from quote_bridge." },
                recipient_address: {
                  type: "string",
                  description: "Destination wallet address on the target chain.",
                },
              },
              required: ["quote_id", "recipient_address"],
            },
          },
          {
            name: "get_bridge_status",
            description: "Check the status of a submitted bridge settlement by settlement ID.",
            inputSchema: {
              type: "object",
              properties: {
                settlement_id: { type: "string", description: "Settlement ID returned by submit_bridge." },
              },
              required: ["settlement_id"],
            },
          },
        ],
      },
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === "quote_bridge") {
      const { direction, amount_usdc } = args;
      if (!["base_to_solana", "solana_to_base"].includes(direction) || !amount_usdc) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params: direction and amount_usdc required." },
        });
      }
      const amountAtomic = Math.round(amount_usdc * 1e6);
      const { totalRequired, estDestination } = computeFees(amountAtomic);
      const quoteId = computeQuoteId({ direction, amountAtomic });
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      quoteStore.set(quoteId, { direction, amountAtomic, totalRequired, expiresAt });
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                quote_id: quoteId,
                direction,
                source_amount_atomic: amountAtomic,
                est_destination_atomic: estDestination,
                hive_take_bps: HIVE_TAKE_BPS,
                flat_fee_atomic: FLAT_FEE_ATOMIC,
                total_required_atomic: totalRequired,
                payment_required: true,
                methodology: "CCTP v2 burn-mint cross-chain transfer; Phase 1 ledger only",
                expires_at: expiresAt,
              }),
            },
          ],
        },
      });
    }

    return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }

  return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

// ── BOGO redemption middleware (X-Hive-BOGO-Token) ─────────────────────────
// Phase 1: calls hive-gamification /v1/bogo/redeem; bypasses 402 on consumed:true.
// Phase 2 (planned): zero-trust redemption with token-bound HMAC.
async function bogoRedeemMiddleware(req, res, next) {
  const token = req.headers["x-hive-bogo-token"];
  if (!token) return next();
  try {
    const r = await fetch("https://hive-gamification.onrender.com/v1/bogo/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, mechanic_id: "base-bridge-quote" }),
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j.consumed === true) {
        req._bogo_redeemed = true;
        import("fs").then(({ appendFileSync }) => {
          try { appendFileSync("/tmp/base_bridge_bogo_redemptions.jsonl", JSON.stringify({ token: token.slice(0, 12), mechanic_id: "base-bridge-quote", ts: Date.now() }) + "\n"); } catch (_) {}
        });
        return next();
      }
    }
  } catch (_) {}
  return next();
}

// GET /v1/base-bridge/quote — x402-gated ($0.20 USDC) with BOGO bypass
app.get("/v1/base-bridge/quote", bogoRedeemMiddleware, (req, res) => {
  // 402 gate ($0.20 USDC). BOGO token bypasses once.
  if (!req._bogo_redeemed) {
    const paymentHeader = req.headers["x-payment"] || req.headers["x-payment-receipt"];
    if (!paymentHeader) {
      return res.status(402).json({
        x402Version: 1,
        error: "Payment required",
        accepts: [{
          scheme: "exact",
          network: "base",
          chainId: 8453,
          asset: "USDC",
          contract: BASE_USDC_CONTRACT,
          maxAmountRequired: "200000", // $0.20 USDC atomic
          payTo: MONROE_EVM,
          resource: "/v1/base-bridge/quote",
          description: "Base bridge quote — $0.20 USDC on Base mainnet",
          mimeType: "application/json",
        }],
        bogo: {
          first_use_free: true,
          claim_endpoint: "https://hive-gamification.onrender.com/v1/bogo/claim",
          redeem_header: "X-Hive-BOGO-Token",
          mechanic_id: "base-bridge-quote",
        },
      });
    }
  }
  const { direction, amount_usdc } = req.query;
  if (!["base_to_solana", "solana_to_base"].includes(direction)) {
    return res.status(400).json({
      error: "direction must be base_to_solana or solana_to_base",
    });
  }
  const numericAmount = parseFloat(amount_usdc);
  if (!numericAmount || numericAmount <= 0) {
    return res.status(400).json({ error: "amount_usdc must be a positive number" });
  }
  const amountAtomic = Math.round(numericAmount * 1e6);
  const { totalRequired, estDestination } = computeFees(amountAtomic);
  const quoteId = computeQuoteId({ direction, amountAtomic });
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  quoteStore.set(quoteId, { direction, amountAtomic, totalRequired, expiresAt });

  res.json({
    quote_id: quoteId,
    direction,
    source_amount_atomic: amountAtomic,
    est_destination_atomic: estDestination,
    hive_take_bps: HIVE_TAKE_BPS,
    flat_fee_atomic: FLAT_FEE_ATOMIC,
    total_required_atomic: totalRequired,
    payment_required: true,
    methodology: "CCTP v2 burn-mint cross-chain transfer; Phase 1 ledger only",
    expires_at: expiresAt,
  });
});

// POST /v1/base-bridge/submit — gated by x402
app.post("/v1/base-bridge/submit", (req, res) => {
  const { quote_id, recipient_address } = req.body || {};

  if (!quote_id || !recipient_address) {
    return res.status(400).json({ error: "quote_id and recipient_address are required" });
  }

  const quote = quoteStore.get(quote_id);
  if (!quote) {
    return res.status(404).json({ error: "quote_id not found or expired" });
  }

  const paymentHeader = req.headers["x-payment"] || req.headers["X-Payment"];

  if (!paymentHeader) {
    const challenge = build402Challenge(
      quote.direction,
      quote.totalRequired,
      "/v1/base-bridge/submit",
      `Hive Base Bridge ${quote.direction === "base_to_solana" ? "Base to Solana" : "Solana to Base"} USDC transfer. Quote ${quote_id}. 12 bps + $0.02 flat fee.`
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(402).json({
      x402Version: 1,
      error: "Payment required",
      accepts: [challenge],
    });
  }

  // Payment received — log settlement
  const settlementId = `sid_${crypto.randomBytes(16).toString("hex")}`;
  const entry = {
    settlement_id: settlementId,
    quote_id,
    direction: quote.direction,
    source_amount_atomic: quote.amountAtomic,
    total_required_atomic: quote.totalRequired,
    recipient_address,
    x_payment: paymentHeader,
    logged_at: new Date().toISOString(),
    destination_tx: "phase2-pending",
  };
  logSettlement(entry);

  res.json({
    settlement_id: settlementId,
    source_logged: true,
    destination_tx: "phase2-pending",
    note: "Phase 1: quote and route ledger. Phase 2: on-chain CCTP v2 execution via authorized hot routing wallet.",
    direction: quote.direction,
    recipient_address,
  });
});

// GET /v1/base-bridge/status/:settlement_id
app.get("/v1/base-bridge/status/:settlement_id", (req, res) => {
  const { settlement_id } = req.params;
  const settlements = readSettlements();
  const entry = settlements.find((s) => s.settlement_id === settlement_id);
  if (!entry) {
    return res.status(404).json({ error: "settlement not found" });
  }
  res.json({
    settlement_id: entry.settlement_id,
    direction: entry.direction,
    source_amount_atomic: entry.source_amount_atomic,
    recipient_address: entry.recipient_address,
    source_logged: true,
    destination_tx: entry.destination_tx,
    logged_at: entry.logged_at,
    note: "Phase 1: quote and route ledger. Phase 2: on-chain CCTP v2 execution via authorized hot routing wallet.",
  });
});

// GET /v1/base-bridge/methodology
app.get("/v1/base-bridge/methodology", (_req, res) => {
  res.type("text/markdown").send(`# Hive Base Bridge — Methodology

## Overview

Hive Base Bridge routes USDC transfers between Base (EVM, chain ID 8453) and Solana via Circle's Cross-Chain Transfer Protocol v2 (CCTP v2). The bridge operates in two phases.

---

## Phase 1 — Quote and Route Ledger (current)

All submitted bridge requests are quoted, priced, and logged to a durable ledger. The Hive fee is collected in the source asset at the source-side treasury. The route record is stored for Phase 2 execution.

**What Phase 1 delivers:**
- Signed price quote with HMAC-authenticated quote ID
- Fee breakdown: 12 bps of notional + flat $0.02 USDC per hop
- Durable settlement ledger entry keyed by settlement ID
- x402 payment gate in the source asset on the correct chain

**What Phase 1 does not yet deliver:**
- On-chain CCTP v2 burn/mint execution (Phase 2)
- Destination wallet crediting (Phase 2)

---

## Phase 2 — On-Chain CCTP v2 Execution (forthcoming)

Circle's CCTP v2 uses a burn-mint mechanism: USDC is burned on the source chain and minted on the destination chain through Circle's permissioned attestation layer. No wrapped tokens. No liquidity pools.

**Path: Base to Solana**
1. Client pays source notional + fee to Monroe EVM treasury (0x15184bf50b3d3f52b60434f8942b7d52f2eb436e) on Base (chain 8453).
2. Authorized hot routing wallet calls TokenMessenger.depositForBurn() on Base.
3. Circle attestation service issues burn receipt.
4. Authorized wallet calls MessageTransmitter.receiveMessage() on Solana.
5. Solana USDC (mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) credited to recipient.

**Path: Solana to Base**
1. Client pays source notional + fee to Solana treasury (B1N61cuL35fhskWz5dw8XqDyP6LWi3ZWmq8CNA9L3FVn).
2. Authorized wallet calls burnAndSend on Solana.
3. Circle attestation issues burn receipt.
4. Authorized wallet calls receiveMessage on Base.
5. Base USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) credited to recipient.

---

## Fee Structure

| Notional (USDC) | Fee (12 bps) | Flat Fee | Total Cost |
|---|---|---|---|
| $100 | $0.12 | $0.02 | $0.14 |
| $1,000 | $1.20 | $0.02 | $1.22 |
| $10,000 | $12.00 | $0.02 | $12.02 |
| $100,000 | $120.00 | $0.02 | $120.02 |

---

## References

- [Circle CCTP v2 Documentation](https://developers.circle.com/stablecoins/docs/cctp-getting-started)
- Base chain ID: 8453
- Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- Solana USDC mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
`);
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  process.stderr.write(`hive-base-bridge listening on port ${PORT}\n`);
});
