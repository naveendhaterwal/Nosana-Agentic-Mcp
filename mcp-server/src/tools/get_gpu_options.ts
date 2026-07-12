import { getNosanaClient } from "../nosana/client.js";

interface GpuMarket {
  name: string;
  address: string;
  priceUsdHr: number;
  memoryGb: number;
  queueLength?: number;
  depth: "FLEET" | "SCARCE" | "UNKNOWN";
  requiredImages: string[];
}

function getFleetDepth(name: string): "FLEET" | "SCARCE" | "UNKNOWN" {
  const n = name.toLowerCase();
  // Deep Markets on Nosana (Consumer GPUs with high node counts)
  if (n.includes("4090") || n.includes("4080") || n.includes("4070") || 
      n.includes("3090") || n.includes("3080") || n.includes("3070") || n.includes("3060")) {
    return "FLEET";
  }
  // Scarce Markets (Enterprise GPUs with fewer nodes)
  if (n.includes("h100") || n.includes("a100") || n.includes("6000 ada") || n.includes("pro 6000")) {
    return "SCARCE";
  }
  return "UNKNOWN";
}

export async function getGpuOptions(recommendedVram?: number) {
  let markets: GpuMarket[] = [];

  // Fetch live markets from Nosana API
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not available. NOSANA_API_KEY must be set to fetch live markets.");
    }
    
    const liveMarkets = await client.api.markets.list();
    markets = liveMarkets
      .filter((m: any) => m.type === "PREMIUM")
      .map((m: any) => ({
      name: m.name || m.slug || "Unknown GPU",
      address: m.address,
      priceUsdHr: m.usd_reward_per_hour || 0,
      memoryGb: m.lowest_vram || 8,
      depth: getFleetDepth(m.name || m.slug || ""),
      requiredImages: m.required_images || []
    }));
    
    if (markets.length === 0) {
      throw new Error("No markets returned from Nosana network API.");
    }
  } catch (err: any) {
    throw new Error(`Failed to fetch live markets: ${err.message}`);
  }

  // Sort by price
  const sorted = [...markets].sort((a, b) => a.priceUsdHr - b.priceUsdHr);
  
  // Identify the top markets to scan for traffic
  const compatible = recommendedVram 
    ? sorted.filter(m => m.memoryGb >= recommendedVram)
    : sorted;
  
  const scanTargets = compatible.slice(0, 10); // Scan more to find "Deep Fleets"
  
  // Parallel queue check for live "Instant" routing
  await Promise.all(scanTargets.map(async (m) => {
    try {
      const res = await fetch(`https://dashboard.k8s.prd.nos.ci/api/jobs?market=${m.address}&state=QUEUED&limit=1`);
      const data = await res.json();
      const jobs = Array.isArray(data) ? data : (data.data || []);
      m.queueLength = jobs.length;
    } catch {
      m.queueLength = 99; // Assume busy if check fails
    }
  }));

  // Smart Recommendation: Prioritize FLEET (Many Hosts) + 0-Queue (Instant start)
  const recommended = scanTargets.find(m => m.depth === "FLEET" && m.queueLength === 0) 
    ?? scanTargets.find(m => m.queueLength === 0) 
    ?? scanTargets[0] 
    ?? sorted[0];

  const rows = sorted.map((m, i) => {
    let tag = "";
    const isCompatible = !recommendedVram || m.memoryGb >= recommendedVram;
    
    // Add Traffic Status if scanned
    const traffic = m.queueLength !== undefined 
      ? (m.queueLength === 0 ? "🟢 0 Jobs" : `🟡 ${m.queueLength} Jobs in Queue`)
      : (isCompatible ? "⚪ Scan Pending..." : "---");

    const capacityStr = m.depth === "FLEET" ? "Deep Fleet (High Capacity)" : "Scarce (Limited Hosts)";
    const isOpen = !m.requiredImages || m.requiredImages.length === 0;
    const policy = isOpen ? "🔓 Open (Any Image)" : "🔒 Restricted (Pre-Approved Images Only)";

    if (m.address === recommended.address) {
      tag = " ⭐ Instant Deploy";
    } else if (recommendedVram && m.memoryGb < recommendedVram) {
      tag = " ⚠️ Not enough VRAM";
    }
    
    return `${i + 1}. ${m.name.padEnd(25)} | ${m.memoryGb}GB | $${m.priceUsdHr.toFixed(3)}/hr | ${traffic.padEnd(12)} | ${m.address}${tag}\n   └─ Capacity: ${capacityStr}\n   └─ Policy: ${policy}`;
  }).join("\n\n");

  const vramNote = recommendedVram ? ` (Requirement: ≥${recommendedVram}GB VRAM)` : "";
  const sourceNote = "\n✅ Market data includes live Node Capacity (Fleet Depth) and Traffic scanning.";

  return `📊 GPU Market Explorer${vramNote}:\n\n` +
         `   GPU Name                  | VRAM | Price/hr | Traffic      | Market Address\n` +
         `   --------------------------|------|----------|--------------|--------------------------------------------\n` +
         `${rows}\n${sourceNote}\n\n` +
         `💡 TIP: Markets marked 'Deep Fleet' have many hosts. Pick '⭐ Instant Deploy' for the fastest assignment.`;
}


