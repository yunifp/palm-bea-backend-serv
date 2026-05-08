const app = require("./index");
const { testConnection } = require("./core/db_config");

testConnection();

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log("listening on port", port);
});
