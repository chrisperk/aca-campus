/**
 * @module controllers/UserController
 * @description Server-side logic for managing users.
 */

var UserModel = require('../models/UserModel');
var _ = require('underscore');
var moment = require('moment');
var CourseModel = require('../models/CourseModel')
var mongoose = require('mongoose');
var stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = {

  /**
  * List all users attached to the current user's client
  * @param {req} req [Express.js Request object]{@link http://expressjs.com/en/api.html#req}
  * @param {res} res [Express.js Response object]{@link http://expressjs.com/en/api.html#res}
  */
  list: function(req, res) {
    UserModel.find({
      client: req.user.client
    }, null, {
      sort: 'last_name',
    }, function(err, users){
      if(err) {
        return res.json(500, {
          message: 'Error getting users.',
          error: err
        });
      }
      return res.json(users);
    });
  },

  /**
  * Show all details of a particular user if attached to current user's client
  * @param {req} req [Express.js Request object]{@link http://expressjs.com/en/api.html#req}
  * @param {res} res [Express.js Response object]{@link http://expressjs.com/en/api.html#res}
  */
  show: function(req, res) {
    var id = req.params.id;
    UserModel.findOne({
      _id: id,
      client: req.user.client
    }, function(err, user){
      if(err) {
        return res.json(500, {
          message: 'Error getting user.',
          error: err
        });
      }
      if(!user) {
        return res.json(404, {
          message: 'No such user'
        });
      }
      CourseModel.find({
        registrations: mongoose.Types.ObjectId(user._id)
      }).populate('term location textbook').exec(function(err, courses) {
        if(err) {
          return res.json(500, {
            message: 'Error getting user courses.',
            error: err
          });
        }
        user.courses = courses;
        if (user.customer_id) {
          stripe.charges.list(
            {
              customer: user.customer_id,
              limit: 100
            },
            function(err, charges) {
              if (err) console.log(err);
              if (charges) {
                user.charges = charges.data;
              }
              return res.json(user);
            }
          );
        } else {
          return res.json(user);
        }
      });
    });
  },

  /**
  * Create a new user and attach to current user's client
  * @param {req} req [Express.js Request object]{@link http://expressjs.com/en/api.html#req}
  * @param {res} res [Express.js Response object]{@link http://expressjs.com/en/api.html#res}
  */
  create: function(req, res) {
    var user = new UserModel();

    var attributes = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'website',
      'github',
      'is_admin',
      'is_instructor',
      'is_student',
      'codecademy',
      'zipcode',
      'credits'
    ];

    _.each(attributes, function(attr) {
      user[attr] =  req.body[attr];
    });
    user.username = req.body.username.toLowerCase();

    UserModel.find({}, 'idn', { limit: 1, sort: { idn: -1 } }, function(err, users) {
      user.idn = users[0].idn + 1;
      user.client = req.user.client;
      user.save(function(err, user){
        if(err) {
          return res.json(500, {
            message: 'Error saving user',
            error: err
          });
        }
        return res.json(user);
      });
    });
  },

  /**
  * Update an existing user if attached to current user's client
  * @param {req} req [Express.js Request object]{@link http://expressjs.com/en/api.html#req}
  * @param {res} res [Express.js Response object]{@link http://expressjs.com/en/api.html#res}
  */
  update: function(req, res) {
    var id = req.params.id;
    UserModel.findOne({
      _id: id,
      client: req.user.client
    }, function(err, user){
      if(err) {
        return res.json(500, {
          message: 'Error saving user',
          error: err
        });
      }
      if(!user) {
        return res.json(404, {
          message: 'No such user'
        });
      }

      var attributes = [
        'first_name',
        'last_name',
        'username',
        'phone',
        'website',
        'github',
        'rocketchat',
        'codecademy',
        'zipcode',
        'reviews'
      ];

      var adminAttrs = [
        'is_admin',
        'is_instructor',
        'is_student',
        'price',
        'credits'
      ];

      if (req.user.is_admin) {
        _.each(adminAttrs, function(attr) {
          user[attr] = req.body.hasOwnProperty(attr) ? req.body[attr] : user[attr];
        });
        if (req.body.generate_api_key) {
          var rand = function() {
            return Math.random().toString(36).substr(2); // remove `0.`
          };

          var token = function() {
            return rand() + rand(); // to make it longer
          };

          user.api_key = token();
        }
      }

      if (req.user.is_admin || req.user._id.toString() === id) {
        _.each(attributes, function(attr) {
          user[attr] = req.body.hasOwnProperty(attr) ? req.body[attr] : user[attr];
        });
      }

      user.save(function(err, user){
        if(err) {
          return res.json(500, {
            message: 'Error getting user.',
            error: err
          });
        }
        if(!user) {
          return res.json(404, {
            message: 'No such user'
          });
        }
        CourseModel.find({
          registrations: mongoose.Types.ObjectId(user._id)
        }).populate('term').exec(function(err, courses) {
          if(err) {
            return res.json(500, {
              message: 'Error getting user courses.',
              error: err
            });
          }
          user.courses = courses;
          return res.json(user);
        });
      });
    });
  },

  /**
  * Destroy a user if attached to current user's client
  * @param {req} req [Express.js Request object]{@link http://expressjs.com/en/api.html#req}
  * @param {res} res [Express.js Response object]{@link http://expressjs.com/en/api.html#res}
  */
  remove: function(req, res) {
    var id = req.params.id;
    UserModel.remove({
      _id: id,
      client: req.user.client
    }, function(err, user){
      if(err) {
        return res.json(500, {
          message: 'Error getting user.',
          error: err
        });
      }
      return res.json(user);
    });
  },

  import: function(req, res) {
    var newUsers = [];
    UserModel.find({client: req.user.client}, 'idn', { limit: 1, sort: { idn: -1 } }, function(err, users) {
      var idn = users[0].idn + 1;
      var idx = 0;
      function newUser(reqUser) {
        UserModel.findOne({ username: reqUser['username'].toLowerCase() }, function(err, existingUser) {
          if (!existingUser && reqUser['username'] && reqUser['first_name'] && reqUser['last_name']) {
            var user = new UserModel({ idn: idn });
            idn++;
            var attributes = [
              'first_name',
              'last_name',
              'phone',
              'website',
              'github',
              'codecademy',
              'zipcode'
            ];

            _.each(attributes, function(attr) {
              user[attr] = reqUser[attr] ? reqUser[attr] : user[attr];
            });
            user.username = reqUser.username ? reqUser.username.toLowerCase() : user.username;
            user.is_student = true;
            user.client = req.user.client;
            user.save(function(err, user) {
              if(err) {
                return res.json(500, {
                  message: 'Error creating user.',
                  error: err
                });
              }
              newUsers.push(user);
              if (req.body[++idx]) {
                newUser(req.body[idx]);
              } else {
                return res.json(200, newUsers);
              }
            });
          } else {
            if (req.body[++idx]) {
              newUser(req.body[idx]);
            } else {
              return res.json(200, newUsers);
            }
          }
        });
      }
      if (req.body.length > 1) {
        return newUser(req.body[idx]);
      } else {
        return res.json(200, req.body);
      }
    });
  },

  attendance: function(req, res) {
    UserModel.findOne({ idn: req.body.idn, client: req.user.client }, function(err, user) {
      if(err) {
        return res.json(500, {
          message: 'Error saving user',
          error: err
        });
      }
      if (!user.attendance) {
        user.attendance = [];
      }
      var matched = _.find(user.attendance, function(date) { return moment(date, 'YYYY-MM-DD HH:ss').isSame(req.body.date, 'day')});
      if (matched) {
        user.attendance.splice(user.attendance.indexOf(matched), 1);
      } else {
        user.attendance.push(req.body.date);
      }

      user.save(() => {
        return res.json(req.body);
      });
    });  
  }
};
