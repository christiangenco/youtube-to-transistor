const axios = require("axios");
const exec = require("child-process-promise").exec;
const marked = require("marked");
const Path = require("path");
const querystring = require("querystring");
const mkdirp = require("mkdirp");

const child_process = require("child_process");

const yargs = require("yargs");
const fetchVideos = require("./fetchVideos");

// makers.dev
// --show-id "15816"

const argv = yargs
  .option("youtubeUrl", {
    alias: "u",
    description: "URL to youtube video",
    type: "string",
  })
  .option("channelId", {
    alias: "c",
    description: "YouTube channel ID",
  })
  .option("showId", {
    alias: "s",
    description: "Transistor show ID",
  })
  .option("transistorApiKey", { alias: "t", description: "Transistor API key" })
  .option("youtubeApiKey", { alias: "y", description: "YouTube API key" })
  .help()
  .alias("help", "h").argv;

// console.log(JSON.stringify(argv, null, 2))

const { showId, youtubeUrl, channelId, transistorApiKey, youtubeApiKey } = argv;

const transistor = axios.create({
  baseURL: "https://api.transistor.fm/v1",
  timeout: 5000,
  headers: { "x-api-key": transistorApiKey },
});

async function get(path, params) {
  const {
    data: { data },
  } = await transistor.get(path, { params });
  return data;
}

async function post(path, data) {
  const res = await transistor.post(path, data);
  return res.data.data;
}

async function patch(path, data) {
  const res = await transistor.patch(path, data);
  return res.data.data;
}

async function fetchEpisodes({ showId }) {
  const episodes = await get("episodes", {
    show_id: showId,
    // pagination: { page: 1, per: 5 },
    // fields: { episode: ["title", "summary"] },
  });
  return episodes
    .map((e) => {
      return {
        id: e.id,
        ...e.attributes,
      };
    })
    .sort((a, b) => b.number - a.number);
}

async function downloadYouTubeAudio({ youtubeId, directory }) {
  const { stdout: info } = await exec(`youtube-dl -F -- "${youtubeId}"`);
  const formats = info
    .split("\n")
    .filter((line) => line.includes("audio only"))
    .map((line) => {
      return {
        id: parseInt(line),
        rate: parseInt(line.match(/(\d+)k/)[1]),
        ext: line.split(/\s+/)[1],
        line,
      };
    })
    .sort((a, b) => b.rate - a.rate);
  const format = formats[0];
  const dest = `${directory}/${youtubeId}.${format.ext}`;

  // console.log("downloading audio");
  // TODO: if dest doesn't exist
  await exec(`youtube-dl -f ${format.id} --output ${dest} -- "${youtubeId}" `);
  return dest;
}

function parseYoutubeURL(url) {
  if (url.includes("youtu.be")) {
    return url.split("youtu.be/")[1];
  } else {
    return querystring.parse(url.split("?")[1]).v;
  }
}
async function fetchVideo({ id }) {
  // console.log({ id });
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${id}&key=${youtubeApiKey}&fields=items(id,snippet(channelId,title,categoryId,thumbnails,description),statistics)&part=snippet,statistics`;
  // console.log(url);
  const res = await axios.get(url);
  const video = res.data.items[0];
  return { id: video.id, ...video.snippet };
}

// async function uploadFile({ src, dest, bucketId }) {
//   // re-host audio
//   // set default acl for the bucket to public
//   // gsutil defacl set public-read gs://bucket-name.appspot.com
//   // gsutil iam ch allUsers:objectViewer gs://bucket-name.appspot.com
//   // does the file already exist?
//   const bucketPath = `gs://${bucketId}/${dest}`;
//   try {
//     await exec(`gsutil ls ${bucketPath}`);
//   } catch (e) {
//     // file does not exist, so upload it now
//     await exec(`gsutil cp -a public-read ${src} ${bucketPath}`);
//   }

//   // gsutil acl ch -u AllUsers:R gs://${bucketId}/makers.dev/o0occBBT8hE.webm
//   const audioUrl = `https://storage.googleapis.com/${bucketId}/${dest}`;
//   return audioUrl;
// }

// node index.js --youtubeId="" --showId=""

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const mediaDirectory = Path.join(__dirname, "media");
  await mkdirp(mediaDirectory);
  console.log({ mediaDirectory });

  console.log("Starting ngrok");
  let ngrokUrl = null;
  const ngrok = require("child_process").spawn("ngrok", [
    "http",
    `file://${mediaDirectory}`,
    "--log",
    "stdout",
  ]);
  ngrok.stdout.on("data", (data) => {
    // t=2022-04-21T10:54:55-0500 lvl=info msg="started tunnel" obj=tunnels name=command_line addr=file:///Users/cgenco/projects/youtube-to-transistor/media/ url=https://d4f9-2600-1700-e64-f10-189-ab27-222a-2c9d.ngrok.io
    const message = data.toString();
    if (message.includes("started tunnel")) {
      ngrokUrl = message.match(/url=([^\s]+)/)[1];
      console.log({ ngrokUrl });
    }
  });
  ngrok.stderr.on("data", (data) => {
    console.error(data.toString());
  });
  ngrok.on("close", (code) => {
    console.log(`ngrok exited with code ${code}`);
  });

  // const shows = await get("shows");

  // get published podcast episodes
  const episodes = await fetchEpisodes({ showId });
  // console.log({ episodes });
  // process.exit(0);

  // get most recent YouTube episodes
  const videos = await fetchVideos({ channelId });
  const video = videos[0];
  // console.log({ videos });
  // process.exit(0);

  // is the most recent YouTube episode already on Transistor?
  // if (episodes[0].title === video.title) {
  //   console.log("No new YouTube videos");
  //   return;
  // }

  // const video = await fetchVideo({ id: parseYoutubeURL(youtubeUrl) });
  console.log(JSON.stringify(video, null, 2));
  // process.exit(0);

  console.log("Downloading YouTube audio");
  const audioPath = await downloadYouTubeAudio({
    youtubeId: video.id,
    directory: mediaDirectory,
  });

  //
  // console.log("re-uploading audio");
  // const audioUrl = await uploadFile({
  //   src: audioPath,
  //   dest: `youtube-to-transistor/${Path.basename(audioPath)}`,
  // });
  const audioUrl = `${ngrokUrl}/${Path.basename(audioPath)}`;
  console.log({ audioUrl });
  // await sleep(100000);
  // process.exit(0);

  console.log("create episode in Transistor");
  const description =
    "<div>" + marked(video.description.replace(/\n/g, "\n<br />\n")) + "</div>";
  const episode = await post("episodes", {
    episode: {
      show_id: showId,
      title: video.title,
      summary: video.description.split("\n")[0],
      description,
      season: episodes[0].season,
      number: episodes[0].number + 1,
      type: "full",
      audio_url: audioUrl,
    },
  });

  console.log("Publishing");
  await patch(`episodes/${episode.id}/publish`, {
    episode: {
      status: "published",
      // published_at: ""
    },
  });

  // console.log("https://dashboard.transistor.fm/shows/makers-dev/episodes");

  console.log("killing ngrok");
  ngrok.kill("SIGINT");
}
main();
