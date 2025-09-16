const allergyService = require('../services/allergy.service');

exports.convertAllergy = async (req, res) => {
  try {
    const result = await allergyService.convertAllergy(req.body);
    res.status(200).json({
      message: '成功轉換 AllergyIntolerance 資料！',
      converterResponse: result
    });
  } catch (error) {
    console.error('AllergyIntolerance 轉換失敗:', error);
    res.status(500).json({
      message: 'AllergyIntolerance 轉換失敗',
      error: error.response ? error.response.data : { message: error.message }
    });
  }
};
