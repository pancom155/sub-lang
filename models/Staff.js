const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
  s_username: { type: String, required: true, unique: true, trim: true },
  s_fname: { type: String, required: true, trim: true },
  s_lname: { type: String, required: true, trim: true },
  s_email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  s_password: { type: String, required: true },
}, { timestamps: true });

StaffSchema.index({ s_email: 1 }, { unique: true });
StaffSchema.index({ s_username: 1 }, { unique: true });

module.exports = mongoose.model('Staff', StaffSchema);
