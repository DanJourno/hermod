var express = require('express');
var router = express.Router();
var utils = require("./utils")
var config = require("../src/config")
var fetch = require('node-fetch');
const mustache = require('mustache');
const crypto = require("crypto"); 
var faker = require('faker');
var btoa = require('btoa');

const database = require('../oauth/database');
const User = database.User;
const OAuthAccessToken = database.OAuthAccessToken;
database.connect();

var ObjectId = require('mongodb').ObjectID;

const MongoClient = require('mongodb').MongoClient
let databaseConnection = null;

function initdb() {
	console.log(['conenct',config.databaseConnection,config.database])
	return new Promise(function(resolve,reject) {
		MongoClient.connect(config.databaseConnection, (err, client) => {
		  if (err) {
			  console.log(err)
			  return //
		  }
		  databaseConnection = client.db(config.database) 
		  resolve();
		})
	});
}

function db() {
	// if not connected will throw exception and process dies
	if (databaseConnection) return databaseConnection;
	else initdb();
}


initdb().then(function() {
	
	console.log(['conencted',config.databaseConnection,config.database,db,database])


});

//const MongoClient = require('mongodb').MongoClient
//let db;
//MongoClient.connect(config.databaseConnection, (err, client) => {
  //if (err) {
	  //console.log(err)
	  //return 
   //}	
  //db = client.db(config.database) 
//})
//var ObjectId = require('mongodb').ObjectID;
 
 
	 
	 
	 
	const userModelName='users';

	// MEMBERSHIP/LOGIN
	router.get("/",function(req,res) {
		res.send('hi');
		utils.sendTemplate(req,res,{"content":utils.renderLogin(req)});
	})

	router.get('/me',function(req,res) {
			  OAuthAccessToken.findOne({ accessToken:req.query.code})
				.then(function(token)  {
					let now = new Date();
					let expire = 0;
					if (token && token.accessTokenExpiresAt)  expire = new Date(token.accessTokenExpiresAt);
					if (now >= expire) {
						res.send('token expired' );
					} else {
						
						if (token != null) {
							db().collection('users').findOne({ _id:token.user}).then(function(user) {
								if (user != null) {
									
									res.send({user:user});
									
								} else {
									res.send('no matching user' );
								}          
							});
						} else {
							res.send('no matching token' );
						}
					}
				}).catch(function(e) {
					//console.log(['failed',e]);
					res.send('failed');
				});
	})


	router.post('/saveuser', function(req, res) {
		if (req.body._id && req.body._id.length > 0) {
			if (req.body.password && req.body.password.length > 0 && req.body.password2 && req.body.password2.length > 0 && req.body.password2 != req.body.password)  {
				res.send({warning_message:'Passwords do not match'});
			} else {
				db().collection(userModelName).findOne(ObjectId(req.body._id), function(err, item) {

					config.userFields.map(function(fieldName) {
						let key = fieldName.trim();
						item[key] = req.body[key] ? req.body[key].trim() : '';
					});
				
				  if (err) {
					  //console.log(err);
					  res.send({warning_message:err});
				  } else if (item!=null) {
					 if (req.body.password && req.body.password.trim().length > 0 && req.body.password2 && req.body.password2.trim().length > 0 && req.body.password === req.body.password2) {
						  item.password=req.body.password.trim();
					 } else {
						  delete item.password
					 }
					
					  // update avatar only when changed
					  if (req.body.avatar && item.avatar != req.body.avatar) {
						  db().collection(userModelName).findOne({avatar:{$eq:req.body.avatar}}, function(err, avUser) {
							  if (avUser!=null) {
								  res.send({warning_message:"Avatar name is already taken, try something different."});
							  } else {
								  db().collection(userModelName).update({'_id': ObjectId(item._id)},{$set:item}).then(function(xres) {
									  item.warning_message="Saved changes";
									  res.send(item);
								  });  
							  }
						  });
					  } else {
						db().collection(userModelName).update({'_id': ObjectId(item._id)},{$set:item}).then(function(xres) {
							  item.warning_message="Saved changes";
							  res.send(item);
						  });  
					  }
				  } else {
					  res.send({warning_message:'ERROR: No user found for update'});
				  }
				}); 
			}
		} else {
			res.send({warning_message:'Missing required information.'});
		}
	});


	function sendToken(req,res,user) {
		 var params={
			username: user.username,
			password: user.password,
			'grant_type':'password',
			'client_id':config.clientId,
			'client_secret':config.clientSecret
	  };
		fetch(config.apiPath+"/oauth/token", {
		  method: 'POST',
		  headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			//Authorization: 'Basic '+btoa(config.clientId+":"+config.clientSecret) 
		  },
		  
		  body: Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')
		}).then(function(response) {
			return response.json();
		}).then(function(token) {
		  //  //console.log(['got token',token]);
		   res.send({code:token.access_token});
		}).catch(function(e) {
		   // //console.log(e);
			 res.send({message:'Error logging in'});
		});
	}

	router.post('/googlesignin',function(req,res) {
	   // //console.log(['/googlesignin']);
		if (req.body.email && req.body.email.length > 0) {
		 //   //console.log(['/googlesignin have mail',req.body.email]);
			 db().collection(userModelName).findOne({username:req.body.email}).then(function(user) {
		   //      //console.log(['/googlesignin fnd',user]);
				  if (user!=null) {
					 sendTokenRequest(res,user);
				  } else {
					  var pw = crypto.randomBytes(20).toString('hex');
					  let item={name:req.body.name,username:req.body.email,password:pw};
					  if (config.allowedUsers.length === 0 ||  (config.allowedUsers.indexOf(item.username.toLowerCase().trim()) >= 0 )) {        
						  if (!item.avatar) item.avatar = faker.commerce.productAdjective()+faker.name.firstName()+Math.round(Math.random()*10000000)
						  db().collection(userModelName).insert(item,function(err,result) {
						   sendTokenRequest(res,item);
						  })                      
					  } else {
						  res.send({message:'Sorry. You are not allowed to login. '});
					  }
					  
				  }
			 }).catch(function(e) {
				 //console.log(e);
				 res.send({message:'Invalid request e'});
			 });
		} else {
			res.send({message:'Invalid request'});
		}
		
		
	})


	router.post('/recover', function(req, res) {
		
	   // //console.log(['recover',req.body]);
		if (req.body.email && req.body.email.length > 0 && req.body.code && req.body.code.length > 0) {
			if (req.body.password.length==0 || req.body.password2.length==0) {
				res.send({warning_message:'Empty password is not allowed'});
			} else if (req.body.password2 != req.body.password)  {
				res.send({warning_message:'Passwords do not match'});
			} else {
		 //       //console.log(['find on saveuser',req.body.email]);
				db().collection(userModelName).findOne({username:req.body.email}, function(err, item) {
				  //console.log([err,item]);
				  if (err) {
					  //console.log(err);
					  res.send({warning_message:err});
				  } else if (item!=null) {
					  item.tmp_password = req.body.password;
					  item.token=req.body.code;
					  // no update email address, item.username = req.body.username;
					  db().collection(userModelName).update({'_id': ObjectId(item._id)},{$set:item}).then(function(xres) {
							//res.redir(config.authorizeUrl);
						 //var hostParts = req.headers.host.split(":");
						 //var host = hostParts[0];
							
						   var link = config.apiPath + '/login/dorecover?code='+item.token;
						   var mailTemplate =  mustache.render(`<div>Hi {{name}}! <br/>


	To confirm your password recovery of your account , please click the link below.<br/>

	<a href="{{link}}" >Confirm your password update</a><br/>

	If you did not recently request a password recovery for your account, please ignore this email.<br/><br/>

									  </div>`,{link:link,name:item.name});
		   //                //console.log(mailTemplate);
									//res.redir(config.authorizeUrl);
						   utils.sendMail(config.mailFrom,req.body.email,"Update your password ",
									 mailTemplate
								  );  
						  item.warning_message="Sent recovery email";
						  res.send(item);
					  });  
					  
				  } else {
					  res.send({warning_message:'No matching user found for recovery'});
				  }
				}); 
			}
		} else {
			res.send({warning_message:'Missing required information.'});
		}
	});


	function sendWelcomeEmail(token,name,username) {
		var link = config.apiPath + '/login/doconfirm?code='+token.access_token;
	//res.redir(config.authorizeUrl);
		utils.sendMail(config.mailFrom,username,'Confirm your registration',
			mustache.render(`<div>Hi {{name}}! <br/>

				Welcome,<br/>

				To confirm your registration, please click the link below.<br/>

				<a href="{{link}}" >Confirm registration</a><br/>

				If you did not recently register, please ignore this email.<br/><br/>

				</div>`,{link:link,name:name}
			)
		);
		item={}
		item.message = 'Check your email to confirm your sign up.';
		return item;
		
	}


	router.post('/signup', function(req, res) {
		console.log(['SERVER SIGNUP',req.body])
		
		
		function fetchTokenSendMail(item) {
			console.log(['FAS',item]);
			
			var params={
				username: item.username,
				password: item.password,
				'grant_type':'password',
				'client_id':config.clientId,
				'client_secret':config.clientSecret
			};
			const https = require("https");
			const agent = new https.Agent({
				
			})
			fetch(config.apiPath+"/oauth/token", {
				agent:agent,
				rejectUnauthorized: false,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Authorization: 'Basic '+btoa(config.clientId+":"+config.clientSecret) 
				},
				body: Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')
			}).then(function(response) {
				return response.json();
			}).then(function(token) {
				console.log('got token');
				console.log(token);
				item.token = token.access_token;
				item.tmp_password=item.password;
				item.password='';
				item.password2='';
				db().collection(userModelName).update({'_id': ObjectId(item._id)},{$set:item}).then(function(result2) {
				   // console.log('updated blank pw');
					res.send(sendWelcomeEmail(token,req.body.name,item.username));
				});
			});  
			  
		}
		
		
		if (req.body.username && req.body.username.length > 0 && req.body.name && req.body.name.length>0 && req.body.avatar && req.body.avatar.length>0 && req.body.password && req.body.password.length>0 && req.body.password2 && req.body.password2.length>0) {
			if (config.allowedUsers.length === 0 ||  (config.allowedUsers.indexOf(req.body.username.toLowerCase().trim()) >= 0 )) {
				
				if (req.body.password2 != req.body.password)  {
					res.send({message:'Passwords do not match.'});
				} else {
					 // update avatar only when changed
					//console.log('seek avatar');
				  
							db().collection(userModelName).findOne({username:req.body.username}, function(err, ditem) {
								if (ditem && ditem.password.length > 0) {
									res.send({'warning':'There is already a user registered with the email address '+req.body.username});
								} else {
									//let item={name:req.body.name.trim(),username:req.body.username.trim(),password:req.body.password.trim(),avatar:req.body.avatar.trim()};
									let item = {}
									config.userFields.map(function(fieldName) {
										let key = fieldName.trim();
										item[key] = req.body[key] ? req.body[key].trim() : '';
									});
									
									
									if (ditem!=null) {
									  item._id = ditem._id;
									  // UPDATE
										//db().collection(userModelName).find({avatar:{$eq:req.body.avatar}}).toArray().then(function(avUser) {
										 // //console.log(['found avatar',avUser]);
											//if (avUser!=null && avUser.length>0) {
												//res.send({message:'Avatar name is already taken, try something different.'});
											//} else {
												db().collection(userModelName).update({'_id': ObjectId(item._id)},{$set:item}).then(function(result2) {
											   // console.log('updated');
													fetchTokenSendMail(item);
												});
											//}
										//}); 
									} else {
									// INSERT  
											db().collection(userModelName).find({avatar:{$eq:req.body.avatar}}).toArray().then(function(avUser) {
										 // //console.log(['found avatar',avUser]);
												if (avUser!=null && avUser.length>0) {
													res.send({message:'Avatar name is already taken, try something different.'});
												} else {
													db().collection(userModelName).insert(item,function(err,result) {
													   // console.log('inserted');
														fetchTokenSendMail(item);
													});                                        
												}
											});
											
									}

								}
							});
					
				}
			} else {
				res.send({message:'Sorry. You are not allowed to register and login.'});
			}
		} else {
			res.send({message:'Missing required information.'});
		}
	});
	  
					   

	function sendTokenRequest(res,user) {
		var params={
				username: user.username,
				password: user.password,
				'grant_type':'password',
				'client_id':config.clientId,
				'client_secret':config.clientSecret
		  };
			fetch(config.apiPath+"/oauth/token", {
			  method: 'POST',
			  headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			  },
			  body: Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')
			}).then(function(response) {
				return response.json();
			}).then(function(token) {
			   res.send({token:token,user:user,message:''});
			}).catch(function(e) {
				console.log(e);
				res.send({message:'Error logging in'});
			});
	}

	router.post('/signin', function(req, res) {
		console.log('SERVER SIGNIN NOW');
		
		console.log(req.body);
		if (req.body.username && req.body.username.length > 0 && req.body.password && req.body.password.length>0) {
				db().collection(userModelName).findOne({username:req.body.username,password:req.body.password}, function(err, item) {
				  if (item!=null) {
						  sendTokenRequest(res,item);
				  } else {
					  res.send({message:'Invalid login credentials.'});
				  }
				});  
		} else {
			 res.send({message:'Missing required information'});
		}
	});



	//,'authorization_code','client_credentials','refresh_token'
	router.get('/doconfirm',function(req,res) {
		let params = req.query;
		 //let request = oauthserver.Request(req);
		//let response = oauthserver.Response(res);
		//return oauth.authenticate(request, response, options)
		  //.then(function(token) {
		    console.log(['APPROVE USER',params]); //,token,params,req]);    
			  User.findOne({ token:params.code})
				.then(function(user)  {
					//let now = new Date();
					//let expire = new Date(token.accessTokenExpiresAt)
					//if (now >= expire) {
						//res.send('token expired try recover password' );
					//} else {
						
						if (user != null) {
							////console.log(['res1',user,user._id,user.username,user.token,user.tmp_password]);
							var userId = user._id;
							//const user = new User({name:user2.name,username:user2.username,_id:user2._id,password:user2.tmp_password, token: null});
						   // //console.log(['res2',userId]);  
							  //res.send('registration '+params.code );
							  ////console.log(user);  
						  ////console.log(user._id);  
						  
						  user.password = user.tmp_password;
						  user.token = undefined;
						  user.tmp_password = undefined;
						 console.log(['KKK',user]); 
						  user.save().then(function() {
							//  //console.log(['approved']);
							   var params={
									username: user.username,
									password: user.password,
									'grant_type':'password',
									'client_id':config.clientId,
									'client_secret':config.clientSecret
							  };
							  fetch(config.apiPath+"/oauth/token", {
								  method: 'POST',
								  headers: {
									'Content-Type': 'application/x-www-form-urlencoded',
								  },
								  
								  body: Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')
								}).then(function(response) {
									return response.json();
								}).then(function(token) {
							 //       //console.log(['got token',token,config.successUrl + '?code='+token.access_token]);
									res.redirect(config.redirectOnLogin + '?code='+token.access_token);
									//res.send({user:user,token:token});
								});
						  }).catch(function(e) {
							  //console.log(['Failed confirmation',e]);
							  res.send('failed ' );
						  });
							
						} else {
							res.send('no matching registration' );
						}
				   // }
				}).catch(function(e) {
					//console.log(['failed',e]);
					res.send('failed');
				});
			
		  //})
		  //.catch(function(err) {
			//// handle error condition
		  //});
		
		
		
	})




	router.get('/dorecover',function(req,res) {
			let params = req.query;
		 //   //console.log(['RECOVER USER',params]); //,token,params,req]);    
			  User.findOne({ token:params.code})
				.then(function(user)  {
				 //   //console.log(['found',user]);
					if (user != null) {
				//        //console.log(['res1',user,user._id,user.username,user.token,user.tmp_password]);
						var userId = user._id;
						//const user = new User({name:user2.name,username:user2.username,_id:user2._id,password:user2.tmp_password, token: null});
				   //     //console.log(['res2',userId]);  
						  //res.send('registration '+params.code );
						  ////console.log(user);  
					  ////console.log(user._id);  
					  
					  user.password = user.tmp_password;
					  user.token = undefined;
					  user.tmp_password = undefined;
			//          //console.log(['KKK',user]); 
					  user.save().then(function() {
					  //    //console.log(['approved']);
						   var params={
								username: user.username,
								password: user.password,
								'grant_type':'password',
								'client_id':config.clientId,
								'client_secret':config.clientSecret
						  };
						  fetch(config.apiPath+"/oauth/token", {
							  method: 'POST',
							  headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
							  },
							  
							  body: Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')
							}).then(function(response) {
								return response.json();
							}).then(function(token) {
						//        //console.log(['got token',token,config.successUrl + '?code='+token.access_token]);
								res.redirect(config.redirectOnLogin + '?code='+token.access_token);
								//res.send({user:user,token:token});
							});
					  }).catch(function(e) {
						  //console.log(['Failed confirmation',e]);
						  res.send('failed ' );
					  });
						
					} else {
						res.send('no matching registration' );
					}
				}).catch(function(e) {
					//console.log(['failed',e]);
					res.send('failed');
				});
			
		  //})
		  //.catch(function(err) {
			//// handle error condition
		  //});
		
		
		
	})



// TESTS
//router.get('/mail',function(req,res) {
  //utils.sendMail(config.mailFrom,'syntithenai@gmail.com','mnemo tester message','<div>This is a message</div>');
//});



module.exports = router;