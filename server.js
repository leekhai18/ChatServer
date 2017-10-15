
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
var collection_Conversations;
var collection_Messages;
var collection_Users;

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
         collection_Conversations = db.collection('conversations');
         collection_Messages = db.collection('messages');
     }
 });
// Init mogodb


io.on('connection', function (socket) {
    console.log('a user connected');

    socket.on('CLIENT_REQUEST_DATA', function(req){
        collection_Users.findOne({email: socket.un}, function(err, res){
            if (err) {
                console.log(err);
            } else {
                if (res != null) {
                    // GIVE Conversations
                    var conversations = res.conversations;
                    var arrayConversations = conversations.split(",");
                    var listMyCon = [];
                    for (var i = 0; i < arrayConversations.length; i++){
                        collection_Conversations.findOne({id: arrayConversations[i]}, function(err, result){
                            if (err) {
                                console.log(err);
                            } else {
                                if (result != null){
                                    var participants = result.participants;
                                    var arrayParticipants = participants.split(",");

                                    for (var j = 0; j < arrayParticipants.length; j++){
                                        if (arrayParticipants[j] != socket.un) {
                                            listMyCon.push(arrayParticipants[j]);
                                        }
                                    }
                                }
                            }
                        });
                    }                

                    // GIVE Friends
                    var friends = res.friends;
                    var arrayFriends = friends.split(",");
                    var listFriends = [];
                    for (var i = 0; i < arrayFriends.length; i++){
                        collection_Users.findOne({email: arrayFriends[i]}, function(err, resF){
                            if (err) {
                                console.log(err);
                            } else {
                                if (resF != null) {
                                    listFriends.push({AVATAR: resF.info.avatar, NAME: resF.info.username, STATE: resF.state, EMAIL: resF.email});
                                }
                            }
                        })
                    }

                    setTimeout(function(){
                        socket.emit('SERVER_SEND_DATA_ME', {NAME: res.info.username, EMAIL: res.email, AVATAR: res.info.avatar});
                        socket.emit('SERVER_SEND_FRIENDS', {SERVER_SEND_FRIENDS: listFriends});
                        socket.emit('SERVER_SEND_CONVERSATIONS', {SERVER_SEND_CONVERSATIONS: listMyCon});
                    }, 300);
                }
            }
        });

        

    });

    socket.on('CLIENT_SEND_MESSAGE', function (obj) {
        var data = JSON.parse(obj);
        console.log(socket.un + ': ' + data.message);

        // name room chat
        var roomString = socket.un + data.receiver;
        var sumCharCode = 0;
        for (i = 0; i < roomString.length; i++) {
            sumCharCode += roomString.charCodeAt(i);
        }       
        var room = sumCharCode.toString();

        if (io.sockets.adapter.rooms[room] == undefined) {
            // join in room
            socket.join(room);
            // get receiver to join, then chat
            var sks = io.sockets.adapter.rooms[data.receiver]; // all in room
            var receiverId = Object.keys(sks.sockets);
            io.sockets.sockets[receiverId].join(room);

            // create conversation, add into db.conversations
            var findIdRoom = collection_Conversations.find({id: room}).limit(1);
            findIdRoom.count(function(err, res){
                if (err) {
                    console.log(err);
                } else {
                    if (!res) {
                        var listParticipants = [socket.un, data.receiver];
                        var newConversation = { id: room,
                                                participants: listParticipants.toString()};
                        collection_Conversations.insertOne(newConversation, function(err, res) {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log("Added this conversation to db");
                            }
                        });

                        // update idConversation to users
                        updateListConversations(socket.un, room);
                        updateListConversations(data.receiver, room);
                    }
                }
            });
        }

        // create message, add into db.messages
        var newMessage = { sender: socket.un,
                        message: data.message,
                        idConversation: room}
        collection_Messages.insertOne(newMessage, function(err, res){
            if (err) {
                console.log(err);
            } else {
                console.log("Added this message to db");
            }
        })
        
        // emit to room expect sender
        socket.to(room).emit('SERVER_SEND_MESSAGE', { SENDER: socket.un, MESSAGE: data.message });
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

    socket.on('CLIENT_REGISTER', function (m_name, m_password, m_email, m_phone) {

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
                                            info: {username: m_name, avatar: "m_avatar", phone: m_phone},
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

        if (socket.un != undefined) {
            //update state
            updateState(socket.un, OFFLINE);

            //Update list friends online to them and myself             
            updateListFriendOnline(socket, socket.un, OFFLINE);
        }   
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

// Update conversations of users
function updateListConversations(userEmail, roomName) {
    collection_Users.findOne({email: userEmail}, function(err, res) {
        if (err) {
            console.log(err);
        } else {
            if (res != null) {
                var conversations = res.conversations;
                var arrayConversations = conversations.split(",");
                arrayConversations.push(roomName);
    
                collection_Users.updateOne({email: userEmail}, {$set: {conversations: arrayConversations.toString()}}, function(err, res){
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("pushed " + roomName + " for " + userEmail);
                    }
                });
            }    
        }
    });
}

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
            if (result != null) {
                var lsFriends = result.friends;
                var arrayFriends = lsFriends.split(",");
                //Emit to friends
                var listFriendsOnline = [];
                for (i = 0; i < arrayFriends.length; i++){
                    collection_Users.findOne({email: arrayFriends[i]}, function(err, resultAF){
                        if (err) {
                            console.log(err);
                        } else {
                            if (resultAF != null) {
                                if (resultAF.state == ONLINE) {
                                    //Add online user to listFriendOnline
                                    if (state == ONLINE) {
                                        listFriendsOnline.push(resultAF.email);
                                    }
        
                                    //send to others
                                    socket.to(resultAF.email).emit('SERVER_UPDATE_STATE_TO_OTHERS', {EMAIL: userEmail, STATE: state});
                                }
                            }       
                        }
                    });
                }
    
                if (state == ONLINE) {
                    //send the socket, because of too fast, so wait 1000ms
                    setTimeout(function(){
                        socket.emit('SERVER_UPDATE_FRIENDS_ONLINE', {SERVER_UPDATE_FRIENDS_ONLINE: listFriendsOnline});
                    }, 1000);
                }
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