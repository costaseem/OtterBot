/* 
DASHBOARD EXAMPLE

  Install the following for dashboard stuff.
  npm install body-parser ejs express express-passport express-session
  npm install level-session-store marked passport passport-discord
  
This is a very simple dashboard example, but even in its simple state, there are still a
lot of moving parts working together to make this a reality. I shall attempt to explain
those parts in as much details as possible, but be aware: there's still a lot of complexity
and you shouldn't expect to really understand all of it instantly.

Pay attention, be aware of the details, and read the comments. 

Note that this *could* be split into multiple files, but for the purpose of this
example, putting it in one file is a little simpler. Just *a little*.
*/

// Native Node Imports
const url = require("url");
const path = require("path");
const fs = require("fs");
const https = require("https");


// Used for Permission Resolving...
const Discord = require("discord.js");

// Express Session
const express = require("express");
const app = express();
const moment = require("moment");
require("moment-duration-format");

// Express Plugins
// Specifically, passport helps with oauth2 in general.
// passport-discord is a plugin for passport that handles Discord's specific implementation.
// express-session and level-session-store work together to create persistent sessions
// (so that when you come back to the page, it still remembers you're logged in).
const passport = require("passport");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const Strategy = require("passport-discord").Strategy;

// Helmet is specifically a security plugin that enables some specific, useful 
// headers in your page to enhance security.
const helmet = require("helmet");

// Used to parse Markdown from things like ExtendedHelp
const md = require("marked");

const { Op, literal, fn, col } = require("sequelize");

module.exports = (client) => {
  // It's easier to deal with complex paths. 
  // This resolves to: yourbotdir/dashboard/
  const dataDir = path.resolve(`${process.cwd()}${path.sep}dashboard`);

  // This resolves to: yourbotdir/dashboard/templates/ 
  // which is the folder that stores all the internal template files.
  const templateDir = path.resolve(`${dataDir}${path.sep}templates`);

  // The public data directory, which is accessible from the *browser*. 
  // It contains all css, client javascript, and images needed for the site.
  app.use("/public", express.static(path.resolve(`${dataDir}${path.sep}public`)));

  // These are... internal things related to passport. Honestly I have no clue either.
  // Just leave 'em there.
  passport.serializeUser((user, done) => {
    done(null, user);
  });
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  /* 
  This defines the **Passport** oauth2 data. A few things are necessary here.
  
  clientID = Your bot's client ID, at the top of your app page. Please note, 
    older bots have BOTH a client ID and a Bot ID. Use the Client one.
  clientSecret: The secret code at the top of the app page that you have to 
    click to reveal. Yes that one we told you you'd never use.
  callbackURL: The URL that will be called after the login. This URL must be
    available from your PC for now, but must be available publically if you're
    ever to use this dashboard in an actual bot. 
  scope: The data scopes we need for data. identify and guilds are sufficient
    for most purposes. You might have to add more if you want access to more
    stuff from the user. See: https://discordapp.com/developers/docs/topics/oauth2 

  See config.js.example to set these up. 
  */
  passport.use(new Strategy({
    clientID: client.appInfo.id,
    clientSecret: client.config.dashboard.oauthSecret,
    callbackURL: client.config.dashboard.callbackURL,
    scope: ["identify", "guilds"]
  },
  (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
  }));

  // Session data, used for temporary storage of your visitor's session information.
  // the `secret` is in fact a "salt" for the data, and should not be shared publicly.
  app.use(session({
    store: new MemoryStore({ checkPeriod: 86400000 }),
    secret: client.config.dashboard.sessionSecret,
    resave: false,
    saveUninitialized: false,
  }));

  // Certificate
  const privateKey = fs.readFileSync("/etc/letsencrypt/live/edmspot.tk-0001/privkey.pem", "utf8");
  const certificate = fs.readFileSync("/etc/letsencrypt/live/edmspot.tk-0001/cert.pem", "utf8");
  const ca = fs.readFileSync("/etc/letsencrypt/live/edmspot.tk-0001/chain.pem", "utf8");

  const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
  };

  // Initializes passport and session.
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(helmet());

  // The domain name used in various endpoints to link between pages.
  app.locals.domain = client.config.dashboard.domain;

  // The EJS templating engine gives us more power to create complex web pages. 
  // This lets us have a separate header, footer, and "blocks" we can use in our pages.
  app.engine("html", require("ejs").renderFile);
  app.set("view engine", "html");

  // body-parser reads incoming JSON or FORM data and simplifies their
  // use in code.
  var bodyParser = require("body-parser");
  app.use(bodyParser.json());       // to support JSON-encoded bodies
  app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
  }));

  /* 
  Authentication Checks. For each page where the user should be logged in, double-checks
  whether the login is valid and the session is still active.
  */
  function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.backURL = req.url;
    res.redirect("/login");
  }

  // This function simplifies the rendering of the page, since every page must be rendered
  // with the passing of these 4 variables, and from a base path. 
  // Objectassign(object, newobject) simply merges 2 objects together, in case you didn't know!
  const renderTemplate = (res, req, template, data = {}) => {
    const baseData = {
      bot: client,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null
    };
    res.render(path.resolve(`${templateDir}${path.sep}${template}`), Object.assign(baseData, data));
  };


  /** PAGE ACTIONS RELATED TO SESSIONS */

  // The login page saves the page the person was on in the session,
  // then throws the user to the Discord OAuth2 login page.
  app.get("/login", (req, res, next) => {
    if (req.session.backURL) {
      //req.session.backURL = req.session.backURL;
    } else if (req.headers.referer) {
      const parsed = url.parse(req.headers.referer);
      if (parsed.hostname === app.locals.domain) {
        req.session.backURL = parsed.path;
      }
    } else {
      req.session.backURL = "/";
    }
    next();
  },
  passport.authenticate("discord"));

  // Once the user returns from OAuth2, this endpoint gets called. 
  // Here we check if the user was already on the page and redirect them
  // there, mostly.
  app.get("/callback", passport.authenticate("discord", { failureRedirect: "/autherror" }), (req, res) => {
    if (req.user.id === client.appInfo.owner.id) {
      req.session.isAdmin = true;
    } else {
      req.session.isAdmin = false;
    }
    if (req.session.backURL) {
      const url = req.session.backURL;
      req.session.backURL = null;
      res.redirect(url);
    } else {
      res.redirect("/");
    }
  });

  // If an error happens during authentication, this is what's displayed.
  app.get("/autherror", (req, res) => {
    renderTemplate(res, req, "autherror.ejs");
  });

  // Destroys the session to log out the user.
  app.get("/logout", function(req, res) {
    req.session.destroy(() => {
      req.logout();
      res.redirect("/"); //Inside a callback… bulletproof!
    });
  });
  
  /** REGULAR INFORMATION PAGES */

  // Index page. If the user is authenticated, it shows their info
  // at the top right of the screen.
  app.get("/", async (req, res) => {
    const totalsongs = await client.db.models.plays.count({
      where: { skipped: false }
    });

    const totalWootsPoints = "(SUM(plays.woots) * 1.12)";
    const totalGrabsPoints = "(SUM(plays.grabs) * 1.2)";
    const totalMehsPoints = "(SUM(plays.mehs) * 1.35)";

    const rank = await client.db.models.plays.findAll({
      attributes: ["author", "title",
        [literal(
          "SUM(woots)"
        ), "totalwoots"],
        [literal(
          "SUM(mehs)"
        ), "totalmehs"],
        [literal(
          "SUM(grabs)"
        ), "totalgrabs"],
        [literal(
          "COUNT(cid)"
        ), "count"],
        [literal(
          "(((((" + totalWootsPoints + " * " + totalGrabsPoints + ") / COUNT(plays.cid)) - " + totalMehsPoints + ") / " + totalsongs + ") * 1000)"
        ), "score"]],
      group: ["author", "title"],
      order: [[literal("score"), "DESC"]],
      limit: 10
    });

    renderTemplate(res, req, "index.ejs", { rank });
  });

  app.get("/blacklist", async (req, res) => {
    const instance = await client.db.models.blacklist.findAll({
      //attributes: ["id", "cid", "moderator", "created_at",
      //  [literal(
      //    "(SELECT users.username FROM users WHERE users.id = blacklist.moderator)"
      //  ), "username"],
      //  [literal(
      //    "(SELECT (plays.author || ' - ' || plays.title) as title FROM plays WHERE plays.cid = blacklist.cid LIMIT 1)"
      //  ), "title"]],
      include: [{
        model: client.db.models.plays
      },
      {
        model: client.db.models.users
      }]
    });

    renderTemplate(res, req, "blacklist.ejs", { instance });
  });
  
  app.get("/songRank", async (req, res) => {
    const totalsongs = await client.db.models.plays.count({
      where: { skipped: false }
    });

    const totalWootsPoints = "(SUM(plays.woots) * 1.12)";
    const totalGrabsPoints = "(SUM(plays.grabs) * 1.2)";
    const totalMehsPoints = "(SUM(plays.mehs) * 1.35)";
    
    const rank = await client.db.models.plays.findAll({
      attributes: ["author", "title",
        [literal(
          "SUM(woots)"
        ), "totalwoots"],
        [literal(
          "SUM(mehs)"
        ), "totalmehs"],
        [literal(
          "SUM(grabs)"
        ), "totalgrabs"],
        [literal(
          "COUNT(cid)"
        ), "count"],
        [literal(
          "(((((" + totalWootsPoints + " * " + totalGrabsPoints + ") / COUNT(plays.cid)) - " + totalMehsPoints + ") / " + totalsongs + ") * 1000)"
        ), "score"]],
      group: ["author", "title"],
      order: [[literal("score"), "DESC"]],
      limit: 1000
    });

    renderTemplate(res, req, "songRank.ejs", { rank });
  });

  app.get("/history", async (req, res) => {
    const instance = await client.db.models.plays.findAll({
      where: {
        created_at: {
          [Op.gt]: client.moment().subtract(360, "minutes").toDate()
        }
      },
      order: [["created_at", "DESC"]],
    });

    renderTemplate(res, req, "history.ejs", { instance });
  });

  app.get("/rules", (req, res) => {
    renderTemplate(res, req, "rules.ejs");
  });

  // The list of commands the bot has. Current **not filtered** by permission.
  app.get("/commands", (req, res) => {
    renderTemplate(res, req, "commands.ejs", { md });
  });

  // The list of plug commands the bot has.
  app.get("/plugCommands", (req, res) => {
    renderTemplate(res, req, "plugCommands.ejs", { md });
  });

  app.get("/plugusers", async (req, res) => {
    renderTemplate(res, req, "plugusers.ejs", {});
  });

  app.get("/eventusers", async (req, res) => {
    const event = await client.db.models.holiday.findAll({
      include: [{
        model: client.db.models.users
      }],
      order: [["currency", "DESC"]]
    });

    renderTemplate(res, req, "eventusers.ejs", { event });
  });

  app.get("/messages", async (req, res) => {
    const messages = await client.db.models.messages.findAll({
      where: {
        id: {
          [Op.ne]: 40333310
        },
        created_at: {
          [Op.gt]: client.moment().subtract(12, "hours").toDate()
        }
      },
      order: [["created_at", "DESC"]]
    });

    renderTemplate(res, req, "messages.ejs", { messages });
  });

  app.get("/rules", (req, res) => {
    renderTemplate(res, req, "rules.ejs");
  });

  const plugPromoters = [
    "https://plug.dj/edmspot/?refuid=4110949",
    "https://plug.dj/edmspot/?refuid=3788262"
  ];

  app.get("/join", (req, res) => {
    var randomPromoter = Math.floor(Math.random() * plugPromoters.length);
    res.redirect(plugPromoters[randomPromoter]);
  });

  // Bot statistics. Notice that most of the rendering of data is done through this code, 
  // not in the template, to simplify the page code. Most of it **could** be done on the page.
  app.get("/stats", (req, res) => {
    const duration = moment.duration(client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");
    const members = client.guilds.reduce((p, c) => p + c.memberCount, 0);
    const textChannels = client.channels.filter(c => c.type === "text").size;
    const voiceChannels = client.channels.filter(c => c.type === "voice").size;
    const guilds = client.guilds.size;
    renderTemplate(res, req, "stats.ejs", {
      stats: {
        servers: guilds,
        members: members,
        text: textChannels,
        voice: voiceChannels,
        uptime: duration,
        memoryUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        dVersion: Discord.version,
        nVersion: process.version
      }
    });
  });

  app.get("/dashboard", checkAuth, (req, res) => {
    const perms = Discord.EvaluatedPermissions;
    renderTemplate(res, req, "dashboard.ejs", { perms });
  });

  // The Admin dashboard is similar to the one above, with the exception that
  // it shows all current guilds the bot is on, not *just* the ones the user has
  // access to. Obviously, this is reserved to the bot's owner for security reasons.
  app.get("/admin", checkAuth, (req, res) => {
    if (!req.session.isAdmin) return res.redirect("/");
    renderTemplate(res, req, "admin.ejs");
  });

  // Simple redirect to the "Settings" page (aka "manage")
  app.get("/dashboard/:guildID", checkAuth, (req, res) => {
    res.redirect(`/dashboard/${req.params.guildID}/manage`);
  });

  // Settings page to change the guild configuration. Definitely more fancy than using
  // the `set` command!
  app.get("/dashboard/:guildID/manage", checkAuth, (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    renderTemplate(res, req, "guild/manage.ejs", { guild });
  });

  // When a setting is changed, a POST occurs and this code runs
  // Once settings are saved, it redirects back to the settings page.
  app.post("/dashboard/:guildID/manage", checkAuth, (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    client.writeSettings(guild.id, req.body);
    res.redirect("/dashboard/" + req.params.guildID + "/manage");
  });

  // Displays the list of members on the guild (paginated).
  // NOTE: to be done, merge with manage and stats in a single UX page.
  app.get("/dashboard/:guildID/members", checkAuth, async (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    renderTemplate(res, req, "guild/members.ejs", {
      guild: guild,
      members: guild.members.array()
    });
  });

  // This JSON endpoint retrieves a partial list of members. This list can
  // be filtered, sorted, and limited to a partial count (for pagination).
  // NOTE: This is the most complex endpoint simply because of this filtering
  // otherwise it would be on the client side and that would be horribly slow.
  app.get("/dashboard/:guildID/members/list", checkAuth, async (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    if (req.query.fetch) {
      await guild.fetchMembers();
    }
    const totals = guild.members.size;
    const start = parseInt(req.query.start, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 50;
    let members = guild.members;

    if (req.query.filter && req.query.filter !== "null") {
      //if (!req.query.filtervalue) return res.status(400);
      members = members.filter(m => {
        m = req.query.filterUser ? m.user : m;
        return m["displayName"].toLowerCase().includes(req.query.filter.toLowerCase());
      });
    }

    if (req.query.sortby) {
      members = members.sort((a, b) => a[req.query.sortby] > b[req.query.sortby]);
    }
    const memberArray = members.array().slice(start, start + limit);

    const returnObject = [];
    for (let i = 0; i < memberArray.length; i++) {
      const m = memberArray[i];
      returnObject.push({
        id: m.id,
        status: m.user.presence.status,
        bot: m.user.bot,
        username: m.user.username,
        displayName: m.displayName,
        tag: m.user.tag,
        discriminator: m.user.discriminator,
        joinedAt: m.joinedTimestamp,
        createdAt: m.user.createdTimestamp,
        highestRole: {
          hexColor: m.highestRole.hexColor
        },
        memberFor: moment.duration(Date.now() - m.joinedAt).format(" D [days], H [hrs], m [mins], s [secs]"),
        roles: m.roles.map(r => ({
          name: r.name,
          id: r.id,
          hexColor: r.hexColor
        }))
      });
    }
    res.json({
      total: totals,
      page: (start / limit) + 1,
      pageof: Math.ceil(members.size / limit),
      members: returnObject
    });
  });

  // Displays general guild statistics. 
  app.get("/dashboard/:guildID/stats", checkAuth, (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    renderTemplate(res, req, "guild/stats.ejs", { guild });
  });

  // Leaves the guild (this is triggered from the manage page, and only
  // from the modal dialog)
  app.get("/dashboard/:guildID/leave", checkAuth, async (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    await guild.leave();
    res.redirect("/dashboard");
  });

  // Resets the guild's settings to the defaults, by simply deleting them.
  app.get("/dashboard/:guildID/reset", checkAuth, async (req, res) => {
    const guild = client.guilds.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    client.settings.delete(guild.id);
    res.redirect("/dashboard/" + req.params.guildID);
  });

  /** API ENDPOINTS */

  // Get DJs list (without pagination)
  app.get("/api/djs", async (req, res) => {
    const totalWootsPoints = "(SUM(plays.woots) * " + client.global.pointsWeight.woots + ")";
    const totalGrabsPoints = "(SUM(plays.grabs) * " + client.global.pointsWeight.grabs + ")";

    const MehsPoints = "((SELECT SUM(mehs) FROM plays a WHERE a.dj = plays.dj))";
    const totalMehsPoints = "(" + MehsPoints + " * " + client.global.pointsWeight.mehs + ")";

    const bancount = "((SELECT COUNT(index) FROM bans WHERE bans.id = plays.dj AND bans.type = 'BAN') * " + client.global.pointsWeight.ban + ")";

    const mutecount = "((SELECT COUNT(index) FROM bans WHERE bans.id = plays.dj AND bans.type = 'MUTE') * " + client.global.pointsWeight.mute + ")";

    const wlbancount = "((SELECT COUNT(index) FROM bans WHERE bans.id = plays.dj AND bans.type = 'WLBAN') * " + client.global.pointsWeight.wlban + ")";

    const totalbans = "((" + bancount + " + " + mutecount + " + " + wlbancount + ") * 100)";

    const propsGivenPoints = "((SELECT COUNT(index) FROM props WHERE props.id = plays.dj) * " + client.global.pointsWeight.propsGiven + ")";
    const totalMessagesPoints = "(((SELECT COUNT(messages.cid) FROM messages WHERE messages.id = plays.dj AND messages.command = false) + points) * " + client.global.pointsWeight.messages + ")";

    const offlineDaysPoints = "(((EXTRACT(DAY FROM current_date-last_seen) * " + client.global.pointsWeight.daysOffline + ") * 100) + 1)";

    const totalsongs = await client.db.models.plays.count({
      where: { skipped: false }
    });

    const totalmehsongs = await client.db.models.plays.count({
      where: {
        skipped: true,
        mehs: {
          [Op.gt]: 4
        }
      }
    });

    const totalpoints = "(" + propsGivenPoints + " + " + totalMessagesPoints + " + ((((" + totalWootsPoints + " + " + totalGrabsPoints + ") / (" + totalMehsPoints + " + 1)) - (" + offlineDaysPoints + " + " + totalbans + ")) * ((CAST(COUNT(plays.cid) as float) / (CAST(" + totalsongs + " as float) + CAST(" + totalmehsongs + " as float))) * 100)))";

    const djRank = await client.db.models.plays.findAll({
      attributes: ["plays.dj",
        [fn("SUM", col("plays.woots")
        ), "totalwoots"],
        [literal(
          "(SELECT SUM(mehs) FROM plays a WHERE a.dj = plays.dj)"
        ), "totalmehs"],
        [fn("SUM", col("plays.grabs")
        ), "totalgrabs"],
        [fn("COUNT", col("plays.cid")
        ), "playscount"],
        [literal(
          "(SELECT COUNT(messages.cid) FROM messages WHERE messages.id = plays.dj AND messages.command = false)"
        ), "totalmessages"],
        [literal(
          "(SELECT COUNT(index) FROM props WHERE props.id = plays.dj)"
        ), "propsgiven"],
        [literal(
          totalpoints
        ), "totalpoints"],
        [literal(
          "(EXTRACT(DAY FROM current_date-last_seen))"
        ), "daysoffline"]],
      include: [{
        model: client.db.models.users,
        attributes: ["username", "id", "last_seen", "points", "props"]
      }],
      where: {
        skipped: false
      },
      group: ["user.id", "plays.dj"],
      order: [[literal("totalpoints"), "DESC"]]
    });

    res.writeHead(200, { "Content-Type": "application/json" });

    res.end(JSON.stringify({ "data": djRank }));
  });

  const httpsServer = https.createServer(credentials, app);

  client.site = httpsServer.listen(client.config.dashboard.port);
};
