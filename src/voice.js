// grab mic button element
const micBtn = document.getElementById("micBtn");

// pick supported speech recognition api
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// grab voice help button element
const voiceHelpBtn = document.getElementById("voiceHelpBtn");

// grab voice help overlay element
const voiceHelpOverlay = document.getElementById("voiceHelpOverlay");

// grab help close button element
const closeHelp = document.getElementById("closeHelp");

// hold recognition instance
let recognition = null;
// track mic active state
let micActive = false;

// set up recognition if available
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;
}

// open the voice help overlay
voiceHelpBtn.onclick = () => {
  voiceHelpOverlay.classList.remove("hidden");
};

// close the voice help overlay
closeHelp.onclick = () => {
  voiceHelpOverlay.classList.add("hidden");
};

// close overlay when clicking backdrop
voiceHelpOverlay.onclick = e => {
  if (e.target === voiceHelpOverlay) {
    voiceHelpOverlay.classList.add("hidden");
  }
};

// toggle mic recording on click
micBtn.onclick = () => {
  if (!recognition) {
    speak("Voice recognition is not supported on this browser");
    return;
  }

  micActive = !micActive;
  micBtn.classList.toggle("active", micActive);

  if (micActive) {
    recognition.start();

    voiceEnabled = true;
    voiceBtn.textContent = "Voice: On";
    voiceBtn.classList.add("active");
    speak("Microphone enabled");
  } else {
    recognition.stop();
  }
};

// wire recognition callbacks
if (recognition) {
  // handle recognized speech result
  recognition.onresult = e => {
    const transcript =
      e.results[e.results.length - 1][0].transcript
        .toLowerCase()
        .trim();

    if (!transcript.startsWith("hey maps")) return;

    voiceEnabled = true;
    voiceBtn.textContent = "Voice: On";
    voiceBtn.classList.add("active");

    const command = transcript.replace("hey maps", "").trim();
    handleVoiceCommand(command);
  };

  // handle recognition errors
  recognition.onerror = () => {
    speak("Sorry, I didn't catch that");
  };
}

// parse and act on voice commands
function handleVoiceCommand(command) {

  // report distance to next turn
  if (command.includes("how far until turn")) {
    if (!navigationActive || !routeSteps[currentStepIndex]) {
      speak("Navigation is not active");
      return;
    }

    const step = routeSteps[currentStepIndex];
    const feet = Math.round(step.distance * 3.28084);
    speak(`About ${feet} feet`);
    return;
  }

  // stop active navigation
  if (command.includes("stop navigation")) {
    if (!navigationActive) {
      speak("Navigation is already stopped");
      return;
    }

    exitNavBtn.click();
    speak("Navigation stopped");
    return;
  }


  // remove a stop from the route
if (command.includes("delete stop") || command.includes("remove stop")) {

  const removeBtn = stopsContainer.querySelector(".stop-remove");

  if (!removeBtn) {
    speak("There are no stops to remove");
    return;
  }

  const wasNavigating = navigationActive;

  // If currently navigating, exit navigation first
  if (wasNavigating) {
    exitNavBtn.click();
  }

  // Remove the stop using the existing UI logic
  removeBtn.click();
  speak("Stop removed");

  // Re-route after stop removal
  setTimeout(() => {
    routeBtn.click();

    // If we were navigating before, re-enter navigation
    if (wasNavigating) {
      setTimeout(() => {
        startNavBtn.click();
        speak("Navigation resumed");
      }, 800);
    }
  }, 400);

  return;
}

  // turn off microphone listening
if (command.includes("turn off microphone")) {
  if (!micActive) {
    speak("Microphone is already off");
    return;
  }

  micActive = false;
  micBtn.classList.remove("active");
  recognition.stop();

  speak("Microphone turned off");
  return;
}

// enter navigation mode
if (command.includes("enter navigation") || command.includes("start navigation")) {
  if (navigationActive) {
    speak("Navigation is already active");
    return;
  }

  if (!routeSteps.length) {
    speak("Please get a route first");
    return;
  }

  startNavBtn.click();
  speak("Navigation started");
  return;
}

  // turn off voice mode
  if (command.includes("turn off voice")) {
    voiceEnabled = false;
    voiceBtn.textContent = "Voice: Off";
    voiceBtn.classList.remove("active");
    speak("Voice mode off");
    return;
  }

  // add a stop to the route
  if (command.includes("add a stop")) {
    if (navigationActive) {
      speak("You cannot add stops during navigation");
      return;
    }

    if (stops.length >= 1) {
      showStopWarning();
      speak("Only one stop per route");
      return;
    }

    addStopBtn.click();
    speak("Please type the stop address");
    return;
  }

  // advise rerouting instructions
  if (command.includes("reroute")) {
    if (navigationActive) {
      speak("Please stop navigation before rerouting");
      return;
    }

    speak("Update the route and press get route");
    return;
  }

  // easter egg
  if (command.includes("maahi is weird")) {
    speak("yes one hundred percent");
    return;
  }

  speak("Command not recognized, if you need help with the commands go to the help button on the bottom right");
}
