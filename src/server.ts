import express from 'express';
import bodyParser from 'body-parser';
import Busboy from 'busboy';
import config from '../config.json';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import mime from 'mime';
import os from 'os';
import util from 'util';
import AdmZip from 'adm-zip';

let app = express();

app.get("/favicon.ico", (req, res) => {
  res.status(404);
  res.json({error: "this_website_doesnt_have_a_favicon_why_do_you_ask_for_it"});
});

app.get("/:tag", async (req, res) => {
  let filePath = path.join(config.imagePath, `${req.params.tag.replace('/', '-')}.zip`);
  console.log(`Accessing ${filePath}`);
  try {
    await fs.promises.access(filePath);
  } catch (e) {
    res.status(404);
    res.json({error: "not_found"});
    return;
  }
  try {
    await new Promise((resolve, rej) => {res.sendFile(filePath, {dotfiles: "deny"}, err => err ? rej(err) : resolve())});
  } catch (e) {
    console.log(e);
    res.status(500);
    res.json({error: "internal_server_error"});
  }
});

app.post("/:tag", async (req, res) => {
  try {
    let dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "follow-robot-tmp-"));
    let files = [];
    let filenames = [];
    await new Promise((resolve, reject) => {
      let busboy = new Busboy({headers: req.headers});
      busboy.on("file", async (fieldname, file, filename, encoding, mimetype) => {
        if (fieldname === "images") {
          let name = (await util.promisify(crypto.randomBytes)(5)).toString("base64").replace("/", "-") + "." + mime.extension(mimetype);
          filenames.push(name);
          files.push(new Promise((resolve, reject) => {
            file.pipe(fs.createWriteStream(path.join(dir, name)));
            file.on("end", resolve);
            file.on("error", reject);
          }));
        }
      });
      busboy.on("finish", () => {
        resolve();
      });
      req.pipe(busboy);
    });
    await Promise.all(files);
    let zip = new AdmZip();
    filenames.forEach((file) => {
      zip.addLocalFile(path.join(dir, file));
    });
    await util.promisify(zip.writeZip)(path.join(config.imagePath, `${req.params.tag.replace('/', '-')}.zip`));
    res.status(200);
    res.json({ok: true});
    await Promise.all(filenames.map(file => path.join(dir, file)).map(fs.promises.unlink));
    await fs.promises.rmdir(dir);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500);
      res.json({error: "internal_server_error"});
    }
  }
});

app.listen(8087);
