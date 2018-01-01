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

var url = 'mongodb://leekhai:123@ds155424.mlab.com:55424/dbchatcloser';
//var url = 'mongodb://localhost:27017/testdb';

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
                                            //Get lastest mess conversation
                                            var latestMess;
                                            var emailFriendChat = arrayParticipants[j];
                                            var cursor = collection_Messages.find({idConversation: result.id}).limit(1).sort({_id:-1});
                                            cursor.each(function(err, doc){
                                                if(!err){
                                                    if (doc != null){
                                                        latestMess = doc;      
                                                        listMyCon.push({EMAIL: emailFriendChat, ID: result.id, LATESTMESSAGE: latestMess});                   
                                                    }

                                                    return false;
                                                }
                                            });
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
                                    listFriends.push({
                                        AVATAR: resF.info.avatar, 
                                        NAME: resF.info.username, 
                                        PHONE: resF.info.phone,
                                        STATE: resF.state, 
                                        EMAIL: resF.email});
                                }
                            }
                        })
                    }    
                    
                    
                    setTimeout(function(){
                        socket.emit('SERVER_SEND_FRIENDS', {SERVER_SEND_FRIENDS: listFriends});
                        socket.emit('SERVER_SEND_CONVERSATIONS', {SERVER_SEND_CONVERSATIONS: listMyCon});

                        collection_Users.findOne({email: socket.un}, function(err, me){
                            if (!err && me != null){
                                var mrequests = me.requests;
                                var marrayRequest = mrequests.split(",");
                                
                                socket.emit('SERVER_SEND_DATA_ME', {NAME: res.info.username, 
                                    EMAIL: res.email, 
                                    AVATAR: res.info.avatar,
                                    PHONE: res.info.phone, 
                                    SERVER_SEND_REQUEST_ADD_FRIEND: marrayRequest});
                            }
                        });
                    }, 400);
                }
            }
        });

        

    });

    socket.on('CLIENT_SEND_MESSAGE', function (obj) {
        var data = JSON.parse(obj);

        // name room chat  
        var room = data.idConversation;

        if (io.sockets.adapter.rooms[room] == undefined) {
            // join in room
            socket.join(room);
            // get receiver to join, then chat
            var sks = io.sockets.adapter.rooms[data.receiver]; // all in room
            if (sks != undefined){
                var receiverId = Object.keys(sks.sockets);
                io.sockets.sockets[receiverId].join(room);
            }

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

                        // emit to receiver info conversation 
                        socket.to(room).emit('SERVER_SEND_NEW_CONVERSATION', {EMAIL: socket.un, ID: room,
                                                                            TYPE: data.type, MESSAGE: data.message, TIME: data.time});

                        // update idConversation to users
                        updateListConversations(socket.un, room);
                        updateListConversations(data.receiver, room);
                    }
                }
            });
        }

        // check receiver having this conversation
        collection_Users.findOne({email: data.receiver}, function(err, doc){
            if (!err && doc != null){
                var listConversation = doc.conversations;
                var arrayConversation = listConversation.split(",");

                arrayConversation.push(room);

                collection_Users.updateOne({email: data.receiver}, {$set: {conversations: arrayConversation.toString()}}, 
                    function(err, res){
                        if (!err) {
                            console.log(data.receiver + " joined " + room);
                            socket.to(data.receiver).emit('SERVER_SEND_NEW_CONVERSATION', {EMAIL: socket.un, ID: room,
                                TYPE: data.type, MESSAGE: data.message, TIME: data.time});
                        }
                    }
                );
            }
        });


        // create message, add into db.messages
        if (data.type != 'AUDIO') {
            var newMessage = {  
                sender: socket.un,
                type: data.type,
                time: data.time,
                message: data.message,
                idConversation: room}

            collection_Messages.insertOne(newMessage, function(err, res){
                if (err) {
                    console.log(err);
                }
            });

            // emit to room expect sender
            socket.to(room).emit('SERVER_SEND_MESSAGE', { SENDER: socket.un, TYPE: data.type, TIME: data.time, MESSAGE: data.message, ROOM: room });
        } else {
            // emit to room expect sender, AUDIO don't save into db
            console.log("just send audio");
            socket.to(room).emit('SERVER_SEND_MESSAGE', { SENDER: socket.un, TYPE: data.type, MESSAGE: data.message, ROOM: room });
        }
    });

    socket.on('CLIENT_LOGIN', function (m_email, m_password) {
        var isSuccess = false;
        var cursor = collection_Accounts.find({ email: m_email });
        cursor.each(function (err, doc) {
            if (err) {
                console.log(err);
                socket.emit('SERVER_RE_LOGIN', false);
            } else {
                if (doc != null) {
                    if (doc.password == m_password) {
                        // LOGIN SUCCESS
                        isSuccess = true;
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
                } 
                
                if (doc == null && !isSuccess) {
                    socket.emit('SERVER_RE_LOGIN', false);
                }

                return false;
            }
        });
    });

    socket.on('CLIENT_REGISTER', function (m_name, m_password, m_email, m_phone, m_avatar) {

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
                            var  newUser = {email: m_email,
                                            info: {username: m_name, avatar: m_avatar, phone: m_phone},
                                            state: OFFLINE,
                                            friends: "",
                                            conversations: "",
                                            requests: ""};

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

    var NUM_MESS_GET = 15;
    socket.on('CLIENT_REQUEST_N_LAST_MESSAGE', function(idRoom){
        var listMess = [];
        var cursor = collection_Messages.find({idConversation: idRoom}).limit(NUM_MESS_GET).sort({_id:-1});
        cursor.each(function(err, doc){
            if (!err){
                if (doc != null){
                    listMess.push(doc);
                }

                if (doc == null) {
                    socket.emit('SERVER_RES_N_LAST_MESSAGE', {SERVER_RES_N_LAST_MESSAGE: listMess});
                    return false;
                }
            }
        });
    });

    socket.on('CLIENT_REQUES_CONTINUE_MESSAGE', function(idRoom, messFrom){
        var listMess = [];
        var cursor = collection_Messages.find({idConversation: idRoom}).skip(messFrom).limit(NUM_MESS_GET).sort({_id:-1});
        cursor.each(function(err, doc){
            if (!err){
                if (doc != null){
                    listMess.push(doc);
                }

                if (doc == null) {
                    socket.emit('SERVER_RES_CONTINUE_MESSAGE', {SERVER_RES_CONTINUE_MESSAGE: listMess});
                    return false;
                }
            }
        });
    });

    socket.on('CLIENT_PULL_USERS_NOT_FRIEND', function(listEmailFriend){
        var listFriend = JSON.parse(listEmailFriend);

        var listUsersNotFriend = [];
        collection_Users.find().forEach(function(doc){
            var flag = true;
            listFriend.forEach(element => {
                if (element == doc.email){
                    flag = false;
                }
            });

            if (doc.email == socket.un){
                flag = false;
            }

            if (flag == true){
                listUsersNotFriend.push({EMAIL: doc.email, NAME: doc.info.username, AVATAR: doc.info.avatar});
            }

        }, callback => {
            socket.emit('SERVER_RES_USERS_NOT_FRIEND', {SERVER_RES_USERS_NOT_FRIEND: listUsersNotFriend});
        });
    });

    socket.on('CLIENT_REQUEST_ADD_FRIEND', function(m_user){
        collection_Users.findOne({email: m_user}, function(err, doc){
            if (!err && doc != null) {
                var requests = doc.requests;
                var arrayRequest = requests.split(",");
                
                var flag = true;
                arrayRequest.forEach(function(req){
                    if (req == socket.un){
                        flag = false;
                    }
                });

                if (flag == true){
                    arrayRequest.push(socket.un);
                    socket.to(m_user).emit('SERVER_SEND_REQUEST_ADD_FRIEND', {SERVER_SEND_REQUEST_ADD_FRIEND: socket.un});

                    collection_Users.updateOne({email: m_user}, {$set: {requests: arrayRequest.toString()}}, function(err, res){
                        if (!err) {
                            console.log(socket.un + " just send request add friend to " + m_user);
                        }
                    });
                }
            }
        });
    });

    socket.on('CLIENT_IGNORE_REQUEST_ADDFRIEND', function(m_user){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null) {
                var requests = doc.requests;
                var arrayRequest = requests.split(",");
                
                var index = arrayRequest.indexOf(m_user);
                if (index > -1) {
                    arrayRequest.splice(index, 1);
                }

                collection_Users.updateOne({email: socket.un}, {$set: {requests: arrayRequest.toString()}}, function(err, res){
                    if (!err) {
                        console.log(socket.un + " just ignore request add friend from " + m_user);
                    }
                });
            }
        });
    });

    socket.on('CLIENT_ACCEPT_REQUEST_ADDFRIEND', function(m_user){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null) {
                var requests = doc.requests;
                var arrayRequest = requests.split(",");
                
                var index = arrayRequest.indexOf(m_user);
                if (index > -1) {
                    arrayRequest.splice(index, 1);
                }

                var listFr = doc.friends;
                var arrayFr = listFr.split(",");
                arrayFr.push(m_user);

                collection_Users.updateOne({email: socket.un}, {$set: {requests: arrayRequest.toString(), friends: arrayFr.toString()}}, 
                    function(err, res){
                        if (!err) {
                            console.log(socket.un + " and " + m_user + " fall in friendship");
                            socket.to(m_user).emit('SERVER_SEND_NEW_FRIEND', {  EMAIL: doc.email, 
                                                                                NAME: doc.info.username,
                                                                                PHONE: doc.info.phone, 
                                                                                AVATAR: doc.info.avatar, 
                                                                                STATE: doc.state});
                        }
                    });
            }
        });

        collection_Users.findOne({email: m_user}, function(err, docu){
            if (!err && docu != null){
                var listFru = docu.friends;
                var arrayFru = listFru.split(",");
                arrayFru.push(socket.un);

                collection_Users.updateOne({email: m_user}, {$set: {friends: arrayFru.toString()}}, 
                function(err, res){
                    if (!err) {
                        console.log(m_user + " and " + socket.un + " fall in friendship");
                        socket.emit('SERVER_SEND_NEW_FRIEND', {EMAIL: docu.email, 
                            NAME: docu.info.username, 
                            AVATAR: docu.info.avatar,
                            PHONE: docu.info.phone, 
                            STATE: docu.state});
                    }
                });
            }
        });
    });

    socket.on('CLIENT_REMOVE_CONVERSATION', function(m_idConversation){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null){
                var listConversation = doc.conversations;
                var arrayConversation = listConversation.split(",");

                var index = arrayConversation.indexOf(m_idConversation);
                if (index > -1) {
                    arrayConversation.splice(index, 1);
                }

                collection_Users.updateOne({email: socket.un}, {$set: {conversations: arrayConversation.toString()}}, 
                    function(err, res){
                        if (!err) {
                            console.log(socket.un + " deleted conversation " + m_idConversation);
                        }
                    }
                );
            }
        });
    });

    socket.on('CLIENT_UNFRIEND', function(m_email){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null){
                var listFriend = doc.friends;
                var arrayFriend = listFriend.split(",");

                var index = arrayFriend.indexOf(m_email);
                if (index > -1) {
                    arrayFriend.splice(index, 1);
                }

                collection_Users.updateOne({email: socket.un}, {$set: {friends: arrayFriend.toString()}}, 
                    function(err, res){
                        if (!err) {
                            console.log(socket.un + " and " + m_email + " are not friend");

                            socket.emit('SERVER_UNFRIEND_SUCCESS', m_email);
                        }
                    }
                );
            }
        });

        collection_Users.findOne({email: m_email}, function(err, doc){
            if (!err && doc != null){
                var listFriend = doc.friends;
                var arrayFriend = listFriend.split(",");

                var index = arrayFriend.indexOf(socket.un);
                if (index > -1) {
                    arrayFriend.splice(index, 1);
                }

                collection_Users.updateOne({email: m_email}, {$set: {friends: arrayFriend.toString()}}, 
                    function(err, res){
                        if (!err) {
                            console.log(m_email + " and " + socket.un + " are not friend");

                            socket.to(m_email).emit('SERVER_UNFRIEND_SUCCESS', socket.un);
                        }
                    }
                );
            }
        });
    })

    socket.on('CLIENT_CHANGE_PASSWORD', function(m_newpassword){
        collection_Accounts.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null){
                isSuccess = false;
                    collection_Accounts.updateOne({email: socket.un}, {$set: {password: m_newpassword}}, 
                    function(err, res){
                        if (!err) {
                            if (res != null){
                                isSuccess = true;
                                console.log(socket.un + " changed password");
                                socket.emit('SERVER_CHANGE_PASSWORD_SUCCESS', true);
                            }

                            if (res == null && !isSuccess){
                                socket.emit('SERVER_CHANGE_PASSWORD_SUCCESS', false);
                            }
                        }
                    }
                );
            }
        });
    });

    socket.on('CLIENT_CHANGE_AVATAR', function(m_avatar){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null){
                var infoUpdate = {username: doc.info.username, avatar: m_avatar, phone: doc.info.phone};
                collection_Users.updateOne({email: socket.un}, {$set: {info: infoUpdate}}, 
                    function(err, res){
                        if (!err) {
                            console.log(socket.un + " changed avatar");
                        }
                    }
                );
            }
        });
    });

    socket.on('CLIENT_CHANGE_NAME', function(m_name){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null){
                var infoUpdate = {username: m_name, avatar: doc.info.avatar, phone: doc.info.phone};
                collection_Users.updateOne({email: socket.un}, {$set: {info: infoUpdate}}, 
                    function(err, res){
                        if (!err) {
                            console.log(socket.un + " changed username");
                        }
                    }
                );
            }
        });
    });

    socket.on('CLIENT_CHANGE_PHONE', function(m_phone){
        collection_Users.findOne({email: socket.un}, function(err, doc){
            if (!err && doc != null){
                var infoUpdate = {username: doc.info.username, avatar: doc.info.avatar, phone: m_phone};
                collection_Users.updateOne({email: socket.un}, {$set: {info: infoUpdate}}, 
                    function(err, res){
                        if (!err) {
                            console.log(socket.un + " changed phonenumber");
                        }
                    }
                );
            }
        });
    });

    socket.on('CLIENT_FORGOT_PASSWORD', function(m_email){
        isSuccess = false;
        collection_Accounts.findOne({email: m_email}, function(err, doc){
            if (!err && doc != null){
                isSuccess = true;
                socket.emit('SERVER_SEND_PASSWORD', doc.password);
                console.log(m_email + " just get password");
            } else if (!isSuccess){
                socket.emit('SERVER_SEND_PASSWORD', false);
                console.log(m_email + " does not exists");
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