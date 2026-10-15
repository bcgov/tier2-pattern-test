// placeholder service entry

// bcgov Tier 2 smoke — Azure LLM spec review target
function health(_req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok" }));
}
module.exports = { health };
