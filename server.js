
var cool = require('cool-ascii-faces');
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require("fs");
var mongodb = require('mongodb');

// LISTENING
server.listen(process.env.PORT || 3000);

app.get('/', function(req, res){
    res.send('<h1>Server is running...</h1>');
});

// Init mogodb
var mongoClient = mongodb.MongoClient;
var collection_Accounts;
//var collection_Conversations;
//var collection_Messages;
//var collection_Users;

//var url = 'mongodb://leekhai:123@ds155424.mlab.com:55424/dbchatcloser';
var url = 'mongodb://localhost:27017/testdb';

mongoClient.connect(url, function (err, db) {
     if (err) {
         console.log('Unable to connect to the mongoDB server. Error:', err);
     } else {
         //HURRAY!! We are connected. :)
         console.log('Connection established to', url);

         //Get collections
         collection_Accounts = db.collection('accounts');
         //collection_Users = db.collection('users');
         //collection_Conversations = db.collection('conversations');
         //collection_Messages = db.collection('messages');
     }
 });
// Init mogodb


//SERVER_LIST_USER_ONLINE

io.on('connection', function (socket) {
    console.log('a user connected');

    socket.on('CLIENT_SEND_MESSAGE', function (message) {
        console.log(socket.un + ': ' + message);
        io.sockets.emit('SERVER_SEND_MESSAGE', { SERVER_SEND_MESSAGE: socket.un + ': ' + message });
    });

    socket.on('CLIENT_SEND_IMAGE', function (bytesImg) {
        console.log('client send new image');
        fs.writeFile(getFilenameImage(socket.id), bytesImg);
    });

    socket.on('CLIENT_SEND_REQUEST_IMAGE', function (request) {
        fs.readFile("test.png", function (err, data) {
            if (!err) {
                io.emit('SERVER_SEND_IMAGE', data);
            } else {
                console.log('send image error!');
            }
        });
    });

    socket.on('CLIENT_SEND_SOUND', function (bytesSound) {
        console.log('client send new sound');
        fs.writeFile(getFilenameSound(socket.id), bytesSound);
    });

    socket.on('CLIENT_SEND_REQUEST_SOUND', function (request) {
        fs.readFile("test.3gpp", function (err, data) {
            if (!err) {
                io.emit('SERVER_SEND_SOUND', data);
            } else {
                console.log('send sound error!');
            }
        });
    });

    socket.on('CLIENT_LOGIN', function (email, password) {
        console.log(email + " loged in");

        var cursor = collection.find({ email: email });
        cursor.each(function (err, doc) {
            if (err) {
                console.log(err);
                socket.emit('SERVER_RE_LOGIN', false);
            } else {
                if (doc != null) {
                    if (doc.password == password) {
                        socket.emit('SERVER_RE_LOGIN', true);
                    } else {
                        socket.emit('SERVER_RE_LOGIN', false);
                    }
                }
            }
        });
    });

    socket.on('CLIENT_REGISTER', function (name, password, email) {

        // Check email existences
        let resultFinding = collection_Accounts.find({email: email}).limit(1);
        resultFinding.count(function(err, isExistence) {
            if (err){
                console.log(err);
            } else {
                if(isExistence) {
                    console.log('email has existed');
                    socket.emit('SERVER_RE_CHECK_EXISTENCE', true);
                } else {
                    socket.un = email;
                    console.log('adding ' + name);
                    socket.emit('SERVER_RE_CHECK_EXISTENCE', false);
        
                    //Add user into collection accounts on mongodb
                    var newUser = { username: name, password: password, email: email };
                        collection_Accounts.insertOne(newUser, function (err, result) {
                        if (err) {
                            console.log(err);
                            socket.emit('SERVER_RE_REGISTER', false);
                        } else {
                            console.log(name + " registed");
                            socket.emit('SERVER_RE_REGISTER', true);
                        }
                    });
                } 
            }
        });
    });


    socket.on('disconnect', function () {
        console.log(socket.un + ' disconnected');
    });
});


// Utility Func remove
Array.prototype.remove = function () {
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
function getFilenameImage(id) {
    return "images/" + id.substring(2) + getMilis() + ".png";
}

function getFilenameSound(id) {
    return "sounds/" + id.substring(2) + getMilis() + ".3gpp";
}

function getMilis() {
    var date = new Date();
    var milis = date.getTime();
    return milis;
}