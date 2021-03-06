const express = require('express');
const axios = require('axios');
const queryString = require('query-string');
const passport = require('passport');
const router = express.Router();
const db = require('../models/index');
const { hasRole } = require('../utils/auth');

router.get('/logout', (req, res) => {
  req.logout();
  return res.send('Logged out');
});

router.get('/login', passport.authenticate('github', { scope: ['user:email'] }));

const getAccessToken = async (code) => {
  return axios.post('https://github.com/login/oauth/access_token', {
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    code: code
  });
}

const getUserProfile = async (accessToken) => {
  const options = {
    headers: {
      Authorization: `token ${accessToken}`
    }
  }
  return axios.get('https://api.github.com/user', options);
}

router.post('/github/callback', async (req, res) => {
  const { code } = req.body;
  const accessTokenResponse = await getAccessToken(code);
  const accessToken = queryString.parse(accessTokenResponse.data).access_token;
  const userProfileResponse = await getUserProfile(accessToken);
  const profile = userProfileResponse.data;
  db.User.findOrCreateByProfile(profile)
    .spread((user, created) => {
      req.login(user, (err) => {
        if (err) { return next(err); }
        return res.send(user);
      });
    });
});

router.post('/:cohort/enrol', hasRole(['teacher']), (req, res) => {
  const { cohort } = req.params;
  const { login } = req.body;
  Promise.all([
    db.User.findByLogin(login),
    db.Cohort.findByCode(cohort)
  ])
    .then(([user, dbCohort]) => {
      user.addCohort(dbCohort)
        .then(() => res.send(`Enrolled ${login} in ${cohort}`));
    });
});

router.post('/:cohort/unenrol', hasRole(['teacher']), (req, res) => {
  const { cohort } = req.params;
  const { login } = req.body;
  Promise.all([
    db.User.findByLogin(login),
    db.Cohort.findByCode(cohort)
  ])
  .then(([user, dbCohort]) => {
    user.removeCohort(dbCohort)
    .then(() => res.send(`Unenrolled ${login} from ${cohort}`));
  });
});

router.put('/users/:login/role', hasRole(['teacher']), (req, res) => {
  const { login } = req.params;
  const { role } = req.body;
  db.User.findByLogin(login)
    .then(user => {
      user.update({ role })
        .then(() => res.send(`${login} is now a ${role}`));
    });
});

module.exports = router;