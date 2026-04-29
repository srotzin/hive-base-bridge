# hive-base-bridge

> **Solana to Base and Base to Solana USDC agent payments in one call.**
> 12 bps + $0.02 flat fee per hop.
> Phase 1: quote and route ledger. Phase 2: on-chain CCTP v2 execution via authorized routing wallet.

---

## Phase 1 Disclosure

This service is in Phase 1. All bridge requests are quoted, priced, and logged to a durable settlement ledger. The Hive fee is collected in the source asset at the source-side treasury. **On-chain CCTP v2 burn-mint execution (Phase 2) is forthcoming via an authorized hot routing wallet.** Phase 1 does not credit the destination wallet.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/` | Root metadata |
| GET | `/.well-known/agent.json` | Agent card (both treasuries, both directions) |
| POST | `/mcp` | JSON-RPC 2.0 MCP — tools: `quote_bridge`, `submit_bridge`, `get_bridge_status` |
| GET | `/v1/base-bridge/quote` | Price quote |
| POST | `/v1/base-bridge/submit` | Submit transfer (x402-gated) |
| GET | `/v1/base-bridge/status/:id` | Settlement status |
| GET | `/v1/base-bridge/methodology` | Full methodology (CCTP v2 path) |

---

## MCP Tools

| Tool | Description |
|---|---|
| `quote_bridge` | Get a price quote for a cross-chain USDC transfer. |
| `submit_bridge` | Submit a bridge request. Gated by x402 payment in source asset. |
| `get_bridge_status` | Check status of a submitted settlement. |

---

## Quote

```
GET /v1/base-bridge/quote?direction=base_to_solana&amount_usdc=1000
```

Response:

```json
{
  "quote_id": "qid_...",
  "direction": "base_to_solana",
  "source_amount_atomic": 1000000000,
  "est_destination_atomic": 998780000,
  "hive_take_bps": 12,
  "flat_fee_atomic": 20000,
  "total_required_atomic": 1001220000,
  "payment_required": true,
  "methodology": "CCTP v2 burn-mint cross-chain transfer; Phase 1 ledger only",
  "expires_at": "2025-..."
}
```

---

## Pricing

| Notional (USDC) | Fee (12 bps) | Flat Fee | Total Cost |
|---|---|---|---|
| $100 | $0.12 | $0.02 | $0.14 |
| $1,000 | $1.20 | $0.02 | $1.22 |
| $10,000 | $12.00 | $0.02 | $12.02 |
| $100,000 | $120.00 | $0.02 | $120.02 |

---

## x402 Payment Gates

### Base to Solana

```json
{
  "scheme": "exact",
  "network": "base",
  "asset": "USDC",
  "payTo": "0x15184bf50b3d3f52b60434f8942b7d52f2eb436e",
  "assetContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
}
```

### Solana to Base

```json
{
  "scheme": "exact",
  "network": "solana",
  "asset": "USDC",
  "payTo": "B1N61cuL35fhskWz5dw8XqDyP6LWi3ZWmq8CNA9L3FVn",
  "assetMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

---

## Treasuries

| Chain | Address |
|---|---|
| Base (EVM, chain 8453) | `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e` |
| Solana | `B1N61cuL35fhskWz5dw8XqDyP6LWi3ZWmq8CNA9L3FVn` |

---

## Assets

| Chain | Asset | Address |
|---|---|---|
| Base | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Solana | USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

---

## Connect

```
https://smithery.ai/server/srotzin/hive-base-bridge
```

MCP endpoint (Streamable HTTP, JSON-RPC 2.0, protocol 2024-11-05):

```
POST https://hive-base-bridge.onrender.com/mcp
```

---

## Methodology

See [/v1/base-bridge/methodology](https://hive-base-bridge.onrender.com/v1/base-bridge/methodology) for the full CCTP v2 burn-mint path, Phase 1 and Phase 2 details.

---

## License

MIT. See [LICENSE](LICENSE).

---

*Hive — <span style="color:#C08D23">#C08D23</span>*
