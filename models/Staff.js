const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const staffSchema = new mongoose.Schema({
  s_username: { type: String, required: true, unique: true, trim: true },
  s_fname: { type: String, required: true, trim: true },
  s_lname: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, match: /@staff\.com$/ },
  s_password: { type: String, required: true }
}, { timestamps: true });

staffSchema.pre('save', async function (next) {
  if (!this.isModified('s_password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.s_password = await bcrypt.hash(this.s_password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

staffSchema.methods.comparePassword = function (inputPassword) {
  return bcrypt.compare(inputPassword, this.s_password);
};

module.exports = mongoose.model('Staff', staffSchema);
