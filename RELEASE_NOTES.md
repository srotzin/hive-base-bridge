# v1.0.0 — Hive Base Bridge MCP Server

Solana to Base and Base to Solana USDC agent payments in one call.

## Tools

| Tool | Description |
|---|---|
| `quote_bridge` | Get a price quote for a cross-chain USDC transfer. Returns fee breakdown, quote ID, and expiry. |
| `submit_bridge` | Submit a bridge request. Gated by x402 payment in the source asset to the source-side Hive treasury. |
| `get_bridge_status` | Check the status of a submitted settlement by settlement ID. |

## Backend Endpoint

`https://hive-base-bridge.onrender.com`

## Pricing

12 bps of notional + flat $0.02 USDC per hop.

| Notional (USDC) | Fee (12 bps) | Flat Fee | Total Cost |
|---|---|---|---|
| $100 | $0.12 | $0.02 | $0.14 |
| $1,000 | $1.20 | $0.02 | $1.22 |
| $10,000 | $12.00 | $0.02 | $12.02 |
| $100,000 | $120.00 | $0.02 | $120.02 |

## Phase 1 Disclosure

This release delivers the quote and route ledger primitive. Phase 2 adds on-chain CCTP v2 burn-mint execution via an authorized hot routing wallet. Phase 1 does not credit the destination wallet.

## Payment Rails

| Direction | Network | Treasury |
|---|---|---|
| Base to Solana | Base (chain 8453), USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Monroe EVM `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e` |
| Solana to Base | Solana, USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Solana treasury `B1N61cuL35fhskWz5dw8XqDyP6LWi3ZWmq8CNA9L3FVn` |

## Council Provenance

Ad-hoc. Real rails, real assets, real network addresses.

## Connect

MCP endpoint (Streamable HTTP, JSON-RPC 2.0, protocol 2024-11-05):
`POST https://hive-base-bridge.onrender.com/mcp`

Smithery: `https://smithery.ai/server/srotzin/hive-base-bridge`

---

*Hive — #C08D23*
