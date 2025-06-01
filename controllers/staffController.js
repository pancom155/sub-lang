const Staff = require('../models/Staff');
const bcrypt = require('bcryptjs');

exports.addStaff = async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.s_password, 10);

    const newStaff = new Staff({
      s_username: req.body.s_username,
      s_fname: req.body.s_fname,
      s_lname: req.body.s_lname,
      s_email: req.body.s_email,
      s_password: hashedPassword
    });

    await newStaff.save();

    res.redirect('/admin/staff');
  } catch (error) {
    console.error('Error adding staff:', error);
    res.status(500).send('Error adding staff');
  }
};

exports.deleteStaff = async (req, res) => {
    try {
      const staffId = req.params.id;
      const staff = await Staff.findByIdAndDelete(staffId);
  
      if (!staff) {
        return res.status(404).send('Staff member not found');
      }

      res.redirect('/admin/staff');
    } catch (error) {
      console.error('Error deleting staff:', error);
      res.status(500).send('Error deleting staff');
    }
  };