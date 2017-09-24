
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require("fs");
var mongodb = require('mongodb');

// Init mogodb
var MongoClient = mongodb.MongoClient;
var url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log('Unable to connect to the mongoDB server. Error:', err);
    } else {
      //HURRAY!! We are connected. :)
      console.log('Connection established to', url);
      collection = db.collection('users_login');
       
    }
});
// Init mogodb

var listUsernames = [];

io.on('connection', function(socket){
    console.log('a user connected');
    
    socket.on('CLIENT_NEW_USER', function(data, isExists){
        if (listUsernames.indexOf(data) > -1){
            console.log('that name has exists');
            isExists(true);
        }else{
            listUsernames.push(data);
            socket.un = data;
            console.log('added ' + data);
            isExists(false);     
            io.sockets.emit('SERVER_LIST_USER_ONLINE', {SERVER_LIST_USER_ONLINE: listUsernames});
        }
    });

    socket.on('CLIENT_SEND_MESSAGE', function(message){
        console.log(socket.un + ': ' + message);
        io.sockets.emit('SERVER_SEND_MESSAGE', {SERVER_SEND_MESSAGE: socket.un + ': ' + message});
    });

    socket.on('CLIENT_SEND_IMAGE', function(bytesImg){
        console.log('client send new image');
        fs.writeFile(getFilenameImage(socket.id), bytesImg);
    });

    socket.on('CLIENT_SEND_REQUEST_IMAGE', function(request){
        fs.readFile("test.png", function(err, data){
            if (!err){
                io.emit('SERVER_SEND_IMAGE', data);
            }else{
                console.log('send image error!');
            }
        });
    });

    socket.on('CLIENT_SEND_SOUND', function(bytesSound){
        console.log('client send new sound');
        fs.writeFile(getFilenameSound(socket.id), bytesSound);
    });

    socket.on('CLIENT_SEND_REQUEST_SOUND', function(request){
        fs.readFile("test.3gpp", function(err, data){
            if (!err){
                console.log('SSSSSSSSSSSSSSSSS');
                io.emit('SERVER_SEND_SOUND', data);
            }else{
                console.log('send sound error!');
            }
        });
    });

    socket.on('CLIENT_LOGIN', function (email, password) {
        console.log(email + " loged in");
     
        var cursor = collection.find({email:email});
        cursor.each(function (err, doc) {
          if (err) {
            console.log(err);
            socket.emit('SERVER_RE_LOGIN', false);
            } else {
             if(doc != null){
                 if(doc.password == password){
                     socket.emit('SERVER_RE_LOGIN', true);
                 }else{
                     socket.emit('SERVER_RE_LOGIN', false);
                    }
                }
            }
        });
    });

    socket.on('CLIENT_REGISTER', function (name, password, email ) {
        console.log(name + " registed");
     
        var user = {name: name, password: password, email: email };
     
        collection.insert(user, function (err, result) {
          if (err) {
             console.log(err);
             socket.emit('SERVER_RE_REGISTER', false);
          } else {
              console.log('Added new user');
              socket.emit('SERVER_RE_REGISTER', true);
          }
        });
    });


    socket.on('disconnect', function(){
        console.log(socket.un + ' disconnected');
        listUsernames.remove(socket.un);
        io.sockets.emit('SERVER_LIST_USER_ONLINE', {SERVER_LIST_USER_ONLINE: listUsernames});
    });
});

server.listen(3000, function(){
  console.log('listening on *:3000');
});


// Utility Func remove
Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

// Utility Create Filenames never same
function getFilenameImage(id){
    return "images/" + id.substring(2) + getMilis() + ".png";
}

function getFilenameSound(id){
    return "sounds/" + id.substring(2) + getMilis() + ".3gpp";
}

function getMilis(){
    var date = new Date();
    var milis = date.getTime();
    return milis;
}
