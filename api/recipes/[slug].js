const { handle } = require("../../lib/api");

module.exports = (req, res) => {
  let slug = req.query && req.query.slug ? String(req.query.slug) : "";
  if (!slug) {
    const match = String(req.url || "").match(/\/api\/recipes\/([^/?]+)/);
    if (match) slug = decodeURIComponent(match[1]);
  }
  return handle(req, res, `/api/recipes/${encodeURIComponent(slug)}`);
};
