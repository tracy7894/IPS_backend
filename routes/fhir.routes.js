// routes/fhir.route.js

//identifier 用身分證
const express = require('express');

const router = express.Router();

router.get("/Patient/:id", async (req, res) => {
  const patientId = req.params.id;
  const everythingUrl = `http://localhost:8080/fhir/Patient/${patientId}/$everything`;

  try {
    const response = await fetch(everythingUrl);
    if (!response.ok) {
      throw new Error(`FHIR Server 錯誤：${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
