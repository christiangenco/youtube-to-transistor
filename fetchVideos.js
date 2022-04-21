const axios = require("axios");
const xml2js = require("xml2js");

module.exports = async function fetchVideos({ channelId }) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const { data: xml } = await axios.get(url);
  const {
    feed: { entry: videos },
  } = await xml2js.parseStringPromise(xml);
  return videos
    .map(v => {
      return {
        title: v.title[0],
        id: v["yt:videoId"][0],
        published: new Date(v["published"][0]),
        updated: new Date(v["updated"][0]),
        thumbnail: v["media:group"][0]["media:thumbnail"][0]["$"].url,
        description: v["media:group"][0]["media:description"][0],
      };
    })
    .sort((a, b) => b.published - a.published);
};
