const multer = require('multer');
const path = require('path');
const fs = require('fs');

const generalStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadGeneral = multer({ storage: generalStorage });

const proofsFolder = 'public/uploads/proofs';
if (!fs.existsSync(proofsFolder)) fs.mkdirSync(proofsFolder, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofsFolder),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const proofFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

const uploadProof = multer({ storage: proofStorage, fileFilter: proofFileFilter });

module.exports = { uploadGeneral, uploadProof };
