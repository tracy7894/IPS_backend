const fs = require('fs');
const path = require('path');

exports.loadRule = (fileName) => {
  const filePath = path.join(__dirname, '../rules', fileName);
  return fs.readFileSync(filePath, 'utf8');
};
