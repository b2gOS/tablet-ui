// self.registration.systemMessageManager.subscribe("alarm").then(
//     rv => {
//       console.log('##########Successfully subscribe system messages of name "alarm".');
//     },
//     error => {
//       console.log("##########Fail to subscribe system message, error: " + error);
//     }
// );

  self.onsystemmessage = evt => {
    console.log("##########Receive systemmessage event with name: " + evt.name);
    console.log("########## message data: " + evt.data);
    console.log("##########  data detail:");
    try {
      console.log(evt.data.json());
    } catch (err) {
      console.log(err);
    }
  };