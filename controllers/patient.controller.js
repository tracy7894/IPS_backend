const patientService = require('../services/patient.service');

exports.convertPatient = async (req, res) => {
  try {
    const result = await patientService.convertPatient(req.body);
    res.status(200).json({
      message: '成功轉換 Patient 資料！',
      converterResponse: result
    });
  } catch (error) {
    console.error('Patient 轉換失敗:', error);
    res.status(500).json({
      message: 'Patient 轉換失敗',
      error: error.response ? error.response.data : { message: error.message }
    });
  }
};
