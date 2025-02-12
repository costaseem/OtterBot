const { isNil } = require("lodash");
const Discord = require("discord.js");

module.exports = function Event(bot, filename, platform) {
  const event = {
    name: bot.plug.events.MODERATE_SKIP,
    platform,
    _filename: filename,
    run: async (data) => {
      if (isNil(data)) return;

      if (data.user.id === bot.plug.getSelf().id) return;

      var skippedSong =  await bot.plug.lastPlay;
      console.log(skippedSong);
      if (isNil(skippedSong)) return;

      const embed = new Discord.RichEmbed()
        //.setTitle("Title")
        .setAuthor(skippedSong.dj.username, "http://icons.iconarchive.com/icons/custom-icon-design/pretty-office-8/64/Skip-forward-icon.png")
        .setColor(0xFF00FF)
        //.setDescription("This is the main body of text, it can hold 2048 characters.")
        .setFooter("By " + data.user.username)
        //.setImage("http://i.imgur.com/yVpymuV.png")
        //.setThumbnail("http://i.imgur.com/p2qNFag.png")
        .setTimestamp()
        //.addField("This is a field title, it can hold 256 characters")
        .addField("ID", skippedSong.dj.id, true)
        .addField("Skipped", skippedSong.media.name + " (youtube.com/watch?v=" + skippedSong.media.cid + ")", false);
      //.addBlankField(true);

      bot.channels.get("487985043776733185").send({embed});
    },
    init() {
      bot.plug.on(this.name, this.run);
    },
    kill() {
      bot.plug.removeListener(this.name, this.run);
    },
  };

  bot.events.register(event);
};