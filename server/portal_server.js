const express = require("express")
const busboy = require("connect-busboy");
const path = require("path");
const fs = require("fs-extra");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express()
const redis = require("redis"),
    client = redis.createClient();

client.on("error", (err) => {
  console.log(err);
})

app.use(busboy());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/download/:id", (req, res) => {
  res.sendFile(path.join(__dirname + "/../public/download.html"));
});

app.get("/assets/download/:id", (req, res) => {

  let id = req.params.id;
  if (!validateID(id)){ 
    res.send(404);
    return;
  }

  
  client.hget(id, "filename", (err, reply) => { // maybe some expiration logic too
    if (!reply) {
      res.sendStatus(404);
    } else {
      res.setHeader("Content-Disposition", "attachment; filename=" + reply);
      res.setHeader("Content-Type", "application/octet-stream");
      
      res.download(__dirname + "/../static/" + id, reply, (err) => {
        if (!err) {
          client.del(id);
          fs.unlinkSync(__dirname + "/../static/" + id);
        }
      });
    }
  })
  
});

app.post("/delete/:id", (req, res) => {
  let id = req.params.id;

  if (!validateID(id)){ 
    res.send(404);
    return;
  }
  
  let delete_token = req.body.delete_token;
  
  if (!delete_token){ 
    res.sendStatus(404);
  }

  client.hget(id, "delete", (err, reply) => {
    if (!reply) {
      res.sendStatus(404);
    } else {
      client.del(id);
      fs.unlinkSync(__dirname + "/../static/" + id);
      res.sendStatus(200);
    }
  })
});

app.post("/upload/:id", (req, res, next) => {
    
    if (!validateID(req.params.id)){ 
      res.send(404);
      return;
    }

    let fstream;
    req.pipe(req.busboy);
    req.busboy.on("file", (fieldname, file, filename) => {
        console.log("Uploading: " + filename);

        //Path where image will be uploaded
        fstream = fs.createWriteStream(__dirname + "/../static/" + req.params.id);
        file.pipe(fstream);
        fstream.on("close", () => {
            let id = req.params.id;
            let uuid = crypto.randomBytes(10).toString('hex');

            client.hmset([id, "filename", filename, "delete", uuid]);

            // delete the file off the server in 24 hours
            // setTimeout(() => {
            //   fs.unlinkSync(__dirname + "/static/" + id);
            // }, 86400000);

            client.expire(id, 86400000);
            console.log("Upload Finished of " + filename);      
            res.send(uuid);
        });
    });
});

app.listen(3000, () => {
  console.log("Portal app listening on port 3000!")
})

let validateID = (route_id) => {
  return route_id.match(/^[0-9a-fA-F]{32}$/) !== null;
}