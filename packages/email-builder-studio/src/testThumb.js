const { JSDOM } = require("jsdom");
const dom = new JSDOM();
global.document = dom.window.document;
global.Image = dom.window.Image;

const ytMatch = "https://www.youtube.com/watch?v=dQw4w9WgXcQ".match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
console.log(ytMatch);
