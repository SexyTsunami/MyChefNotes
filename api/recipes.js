const { handle } = require("../lib/api");

module.exports = (req, res) => handle(req, res, "/api/recipes");
