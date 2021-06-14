self.registration.systemMessageManager.subscribe("activity").then(
    rv => {
      console.log('Successfully subscribe system messages of name "activity".');
    },
    error => {
      console.log("Fail to subscribe system message, error: " + error);
    }
  );
