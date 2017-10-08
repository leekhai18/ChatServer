
var cool = require('cool-ascii-faces');
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require("fs");
var mongodb = require('mongodb');

const ONLINE = "online";
const OFFLINE = "offline";

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
         collection_Users = db.collection('users');
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

    socket.on('CLIENT_LOGIN', function (m_email, m_password) {
        console.log(m_email + " logging...");

        var cursor = collection_Accounts.find({ email: m_email });
        cursor.each(function (err, doc) {
            if (err) {
                console.log(err);
                socket.emit('SERVER_RE_LOGIN', false);
            } else {
                if (doc != null) {
                    if (doc.password == m_password) {
                        // LOGIN SUCCESS
                        socket.emit('SERVER_RE_LOGIN', true);
                        console.log(m_email + " logged");
                        socket.un = m_email;
                        socket.join(m_email);
                        

                        //update state
                        updateState(socket.un, ONLINE);

                        //Update list friends online to them and myself             
                        updateListFriendOnline(socket, socket.un, ONLINE);

                    } else {
                        socket.emit('SERVER_RE_LOGIN', false);
                        console.log("password is wrong");
                    }
                } else {
                    socket.emit('SERVER_RE_LOGIN', false);
                    console.log("email does not exist");
                }

                //break
                return false;
            }
        });
    });

    socket.on('CLIENT_REGISTER', function (m_name, m_password, m_email) {

        // Check email existences
        let resultFinding = collection_Accounts.find({email: m_email}).limit(1);
        resultFinding.count(function(err, isExistence) {
            if (err){
                console.log(err);
            } else {
                if(isExistence) {
                    console.log('email has existed');
                    socket.emit('SERVER_RE_CHECK_EXISTENCE', true);
                } else {
                    console.log('adding ' + m_name);
                    socket.emit('SERVER_RE_CHECK_EXISTENCE', false);
        
                    //Add account into collection accounts on mongodb
                    var newAccount = { username: m_name, password: m_password, email: m_email };
                        collection_Accounts.insertOne(newAccount, function (err, result) {
                        if (err) {
                            console.log(err);
                            socket.emit('SERVER_RE_REGISTER', false);
                        } else {
                            console.log(m_name + " registed");
                            socket.emit('SERVER_RE_REGISTER', true);

                            //Add base-user corresponding to account that is just create
                            var listFriends = ["leekhai1", "leekhai2"];

                            var listConversations = [];

                            var  newUser = {email: m_email,
                                            info: {username: m_name, avatar: "m_avatar"},
                                            state: OFFLINE,
                                            friends: listFriends.toString(),
                                            conversations: listConversations.toString()};

                            collection_Users.insertOne(newUser, function(err) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    console.log("Added base-user corresponding to account that is just create");
                                }
                            })
                        }
                    });
                } 
            }
        });
    });


    socket.on('disconnect', function () {
        console.log(socket.un + ' disconnected');

        //update state
        updateState(socket.un, OFFLINE);

        //Update list friends online to them and myself             
        updateListFriendOnline(socket, socket.un, OFFLINE);
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

// Update state of user
function updateState(userEmail, state) {
    collection_Users.updateOne({email: userEmail}, {$set: {state: state}}, function(err, result){
        if (err) {
            console.log(err);
        } else {
            console.log(userEmail + " update to " + state);
        }
    });
}

// Update list friends online
function updateListFriendOnline(socket, userEmail, state) {
    collection_Users.findOne({email: userEmail}, function(err, result){
        if (err) {
            console.log(err);
        } else {
            var lsFriends = result.friends;
            console.log(lsFriends);

            var arrayFriends = lsFriends.split(",");
            //Emit to friends
            var listFriendsOnline = [];
            for (i = 0; i < arrayFriends.length; i++){
                collection_Users.findOne({email: arrayFriends[i]}, function(err, resultAF){
                    if (err) {
                        console.log(err);
                    } else {
                        if (resultAF.state == ONLINE) {
                            //Add online user to listFriendOnline
                            if (state == ONLINE) {
                                listFriendsOnline.push(resultAF.email);
                            }

                            //send to others
                            socket.to(resultAF.email).emit('SERVER_UPDATE_STATE_TO_OTHERS', {SERVER_UPDATE_STATE_TO_OTHERS: userEmail, USER_STATE: state});
                        }
                    }
                });
            }

            if (state == ONLINE) {
                //send the socket, because of too fast, so wait 1000ms
                setTimeout(function(){
                    console.log(socket.un + " list: " + listFriendsOnline);
                    socket.emit('SERVER_UPDATE_FRIENDS_ONLINE', {SERVER_UPDATE_FRIENDS_ONLINE: listFriendsOnline});
                }, 1000);
            }
        }
    });
}

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