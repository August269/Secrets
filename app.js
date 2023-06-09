//jshint esversion:6

const express = require("express");
const ejs = require("ejs");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const users = require("./users");
const session = require('express-session');
const passport = require("passport");
const LocalStrategy = require('passport-local');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

//create app
const app = express();

app.use(require('cookie-parser')());

//session
var sess = {
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {}
}

app.set('trust proxy', 1); // trust first proxy
sess.cookie.secure = false; // serve secure cookies NOTE: in dev environ if set to true will not authenticate user

app.use(session(sess))

//passport 
app.use(passport.initialize());
app.use(passport.session()); //use passport to manage sessions

//create local authenticaion strategy for passport local
passport.use(new LocalStrategy(
    function (username, password, done) {
        // users.User.findOne({ username: username }, function (err, user) {
        //     if (err) { return done(err); }
        //     if (!user) { return done(null, false); }
        //     if (!user.verifyPassword(password)) { return done(null, false); }
        //     return done(null, user);

        //check password using passport local mongoose
        const authenticate = users.User.authenticate();
        authenticate(username, password, function (err, result) {
            if (err) {
                console.log(err);
                res.send(err);
            } else {
                if (result) {
                    console.log("correct password", result);
                    return done(null, result);
                } else {
                    console.log("incorrect password", result);
                    return done(null, false);
                }
            }
        });
    }
));

// use static serialize and deserialize of model for passport session support
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (user, done) {
    done(null, user);
});

//oauth20
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},
    async function (accessToken, refreshToken, profile, cb) {
        //find or create user --try findOrCreate plugin 
        try {
            const theUser = await users.User.findOne({ googleId: profile.id });
            if (theUser) {
                //exists
                return cb(null, theUser);
            } else {
                //create user
                const newUser = new users.User({
                    googleId: profile.id
                });
                await newUser.save();
                return cb(null, newUser);
            }
        } catch (e) {
            console.log(e);
        }
    }
));

//use body-parser as middleware to handle http request
app.use(bodyParser.urlencoded({ extended: true }));

//set up view engine
app.set('view engine', 'ejs');

//serve public static files
app.use(express.static("public"));

//connect to db
users.connectDb();

//test passport local mongoose authentication
// users.User.register({ username: 'username', active: true }, 'password', function (err, user) {
//     if (err) {
//         console.log(err);
//     }

//     const authenticate = users.User.authenticate();
//     authenticate('username', 'password', function (err, result) {
//         if (err) {
//             console.log(err);
//         } else {
//             console.log(result);
//         }

//         // Value 'result' is set to false. The user could not be authenticated since the user is not active
//     });
// });

//routes
//root
app.get("/", (req, res) => {
    res.render("home");
});

//google oauth
app.get('/auth/google',
    passport.authenticate('google', { scope: ["profile"] }));

app.get('/auth/google/secrets',
    passport.authenticate('google', { successRedirect: '/secrets', failureRedirect: '/login' }),
    function (req, res) {
        // Successful authentication, redirect to secrets
        res.redirect('/secrets');
    });
//login
app.get("/login", (req, res) => {
    res.render("login");
});

app.post('/login',
    passport.authenticate('local', { successRedirect: '/secrets', failureRedirect: '/login' }),
    function (req, res) {
        res.redirect('/');
    });

//logout
app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            console.log(err);
        } else {
            res.redirect("/");
        }
    });
})

//register
app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async (req, res) => {
    //use passport local mongoose to register user
    users.User.register({ username: req.body.username, active: true }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            res.send(err);
        } else {
            //redirect user to login
            res.redirect("/login");
        }
    });
});


//submit
app.get("/submit", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("submit");
    } else {
        res.redirect("/login");
    }
});

app.post("/submit", async (req, res) => {
    submittedSecret = req.body.secret;
    //write secret to db
    try {
        const foundUser = await users.User.findById(req.user._id);
        if (foundUser) {
            foundUser.secret = submittedSecret;
            await foundUser.save();
            res.redirect("/secrets");
        } else {
            res.send("user not found!");
        }
    } catch (e) {
        console.log(e);
        res.send(e);
    }
})

//secrets
app.get("/secrets", async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const foundUsers = await users.User.find({
                "secret": { $ne: null }
            });
            res.render("secrets", { foundUsers: foundUsers });
        } catch (e) {
            console.log(e);
            res.send(e);
        }
    } else {
        console.log(req.isAuthenticated());
        res.redirect("/login");
    }
});

app.listen(3000, function () {
    console.log("server listening on port 3000.")
})

