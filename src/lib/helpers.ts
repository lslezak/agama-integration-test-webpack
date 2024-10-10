import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";

import * as puppeteer from "puppeteer-core";
// see https://nodejs.org/docs/latest-v20.x/api/test.html
import { it as testIt, before, after } from "node:test";

export let page: puppeteer.Page;
let browser: puppeteer.Browser;
let url: string;

// directory for storing the dumped data after a failure
const dir = "log";

interface BrowserSettings {
  product: puppeteer.Product;
  executablePath: string;
}

// helper function for configuring the browser
function browserSettings(name: string): BrowserSettings {
  switch (name.toLowerCase()) {
    case "firefox":
      return {
        product: "firefox",
        executablePath: "/usr/bin/firefox",
      };
    case "chrome":
      return {
        product: "chrome",
        executablePath: "/usr/bin/google-chrome-stable",
      };
    case "chromium":
      return {
        product: "chrome",
        executablePath: "/usr/bin/chromium",
      };
    default:
      throw new Error(`Unsupported browser type: ${name}`);
  }
}

export async function startBrowser(
  headless: boolean,
  slowMo: number,
  agamaBrowser: string,
  agamaServer: string
) {
  url = agamaServer;
  browser = await puppeteer.launch({
    // "webDriverBiDi" does not work with old FireFox, comment it out if needed
    protocol: "webDriverBiDi",
    headless,
    ignoreHTTPSErrors: true,
    timeout: 30000,
    slowMo,
    defaultViewport: {
      width: 1280,
      height: 768,
    },
    ...browserSettings(agamaBrowser),
  });

  page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(agamaServer, {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  });
  return { page, browser };
}

export async function finishBrowser() {
  if (page) await page.close();
  if (browser) await browser.close();
}

export function test_init(options) {
  before(async function () {
    ({ page } = await startBrowser(
      !options.headed,
      options.slowMo,
      options.browser,
      options.url
    ));
  });

  after(async function () {
    await finishBrowser();
  });
}

let failed = false;
let continueOnError = false;

// helper function, dump the index.css file so the HTML dump can properly displayed
function dumpCSS() {
  let cssData = [];
  https
    .get(
      url + "/index.css",
      {
        // ignore HTTPS errors (self-signed certificate)
        rejectUnauthorized: false,
        // use gzip compression
        headers: { "Accept-Encoding": "gzip" },
      },
      (res) => {
        res.on("data", (chunk) => {
          cssData.push(Buffer.from(chunk, "binary"));
        });

        res.on("end", () => {
          // merge all chunks
          const data = Buffer.concat(cssData);
          if (res.headers["content-encoding"] === "gzip") {
            zlib.gunzip(data, (err, unpacked) => {
              fs.writeFileSync(dir + "/index.css", unpacked);
            });
          } else {
            fs.writeFileSync(dir + "/index.css", data);
          }
        });
      }
    )
    .on("error", (e) => {
      console.error("Cannot download index.css: ", e);
    });
}

// dump the current page displayed in puppeteer
async function dumpPage(label: string) {
  // base file name for the dumps
  const name = path.join(dir, label.replace(/[^a-zA-Z0-9]/g, "_"));
  await page.screenshot({ path: name + ".png" });
  const html = await page.content();
  fs.writeFileSync(name + ".html", html);
}

// define it() as a wrapper which dumps the page on a failure
export async function it(label: string, test: () => Promise<void>) {
  testIt(
    label,
    // abort when the test takes more than one minute
    { timeout: 60000 },
    async (t) => {
      try {
        // do not run any test after first failure
        if (failed) t.skip();
        else await test();
      } catch (error) {
        // remember the failure for the next tests
        if (!continueOnError) failed = true;
        if (page) {
          // dump the current page
          if (!fs.existsSync(dir)) fs.mkdirSync(dir);
          await dumpPage(label);
          dumpCSS();
        }
        throw new Error("Test failed!", { cause: error });
      }
    }
  );
}
