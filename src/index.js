const express = require('express');

const app = express();

app.get('/echo', (req, res) => {
  const { message } = req.query;
  if (!message) {
    return res.status(400).json({ error: 'message query parameter is required' });
  }
  return res.status(200).json({ message });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Service listening on port ${port}`);
  });
}

module.exports = app;
