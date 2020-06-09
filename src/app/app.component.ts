import { Component, OnInit } from "@angular/core";
//import COCO-SSD model as cocoSSD
import * as cocoSSD from "@tensorflow-models/coco-ssd";
import { v4 as uuidv4 } from "uuid";
// declare const WSClient: any;

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent implements OnInit {
  title = "TF-ObjectDetection";
  private video: HTMLVideoElement;

  wsClient: any;
  objectDetectionThreshold: number = 10;
  personThreshold: number = 100;
  objectsDetected = new Map();
  objectsSent = new Set();
  shopping: boolean = false;
  personInFrames = [];
  personId: number;
  storeId: number = 9763;
  sessionId: number;

  constructor() {
    try {
      this.wsClient = new WebSocket("ws://localhost:5555");
      this.wsClient.onmessage = (message: any) => {
        this.handleTrigoClientMessages(message.data);
      };
    } catch (error) {
      console.log("unable to connect to ws server", error);
    }
  }

  handleTrigoClientMessages = (message: any) => {
    console.log("Message received: ", message);
    let messageObj = JSON.parse(message);
    if (messageObj.type == "personidentified") {
      let dataToSend: any = {
        id: uuidv4(),
        ackId: uuidv4(),
        time: new Date(),
        storeId: this.storeId,
        type: "personpaired",
        data: {
          pairingId: messageObj.data.pairingId,
          areaId: messageObj.data.areaId,
          persons: [
            {
              personId: this.personId,
              sessionId: this.sessionId
            }
          ]
        }
      };
      dataToSend = JSON.stringify(dataToSend);
      this.wsClient.send(dataToSend);
    }
  };

  sendMessage = message => {
    try {
      let dataToSend: any = {
        id: uuidv4(),
        ackId: uuidv4(),
        time: new Date(),
        storeId: this.storeId
      };

      if (message == "person") {
        this.personId = uuidv4();
        this.sessionId = uuidv4();
        dataToSend = {
          ...dataToSend,
          type: "sessionstarted",
          data: { personId: this.personId, sessionId: this.sessionId }
        };
        dataToSend = JSON.stringify(dataToSend);
        this.wsClient.send(dataToSend);
        this.shopping = true;
      } else if (message == "shopping completed") {
        dataToSend = {
          ...dataToSend,
          type: "sessionended",
          data: {
            personId: this.personId,
            sessionId: this.sessionId
          }
        };
        dataToSend = JSON.stringify(dataToSend);
        this.wsClient.send(dataToSend);
        console.log("shopping is inactive");
      } else if (this.shopping) {
        dataToSend = {
          ...dataToSend,
          type: "itemsdetected",
          data: {
            personId: this.personId,
            sessionId: this.sessionId,
            item: message
          }
        };
        dataToSend = JSON.stringify(dataToSend);
        this.wsClient.send(dataToSend);
      }
    } catch (error) {
      console.log("failed to send message ws server", error);
    }
  };

  shouldShoppingEnd = () => {
    if (this.personInFrames.length < this.personThreshold) return false;
    for (let i = 0; i < this.personInFrames.length; i++) {
      if (this.personInFrames[i]) {
        return false;
      }
    }
    return true;
  };

  handlePredictions = predictions => {
    let personInFrame = false;
    predictions.forEach(prediction => {
      if (!this.objectsDetected.has(prediction.class)) {
        this.objectsDetected.set(prediction.class, 1);
      } else {
        this.objectsDetected.set(
          prediction.class,
          this.objectsDetected.get(prediction.class) + 1
        );
      }
      if (prediction.class == "person") {
        personInFrame = true;
      }
    });

    this.personInFrames.push(personInFrame);
    if (this.personInFrames.length > this.personThreshold) {
      this.personInFrames.shift();
    }

    this.objectsDetected.forEach((value: any, key: any) => {
      if (value > this.objectDetectionThreshold && !this.objectsSent.has(key)) {
        this.sendMessage(key);
        this.objectsSent.add(key);
      }
    });

    if (!personInFrame && this.shopping && this.shouldShoppingEnd()) {
      this.shopping = false;
      this.objectsDetected.clear();
      this.objectsSent.clear();
      this.sendMessage("shopping completed");
    }
  };

  ngOnInit() {
    this.webcam_init();
    this.predictWithCocoModel();
  }

  public async predictWithCocoModel() {
    const model = await cocoSSD.load("lite_mobilenet_v2");
    this.detectFrame(this.video, model);
    console.log("model loaded");
  }

  webcam_init() {
    this.video = <HTMLVideoElement>document.getElementById("vid");
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: "user"
        }
      })
      .then(stream => {
        this.video.srcObject = stream;
        this.video.onloadedmetadata = () => {
          this.video.play();
        };
      });
  }

  detectFrame = (video, model) => {
    model.detect(video).then(predictions => {
      this.renderPredictions(predictions);
      requestAnimationFrame(() => {
        this.detectFrame(video, model);
      });
    });
  };

  renderPredictions = predictions => {
    // console.log("predictions are 2: ", predictions);
    const canvas = <HTMLCanvasElement>document.getElementById("canvas");

    const ctx = canvas.getContext("2d");

    canvas.width = 300;
    canvas.height = 300;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // Font options.
    const font = "16px sans-serif";
    ctx.font = font;
    ctx.textBaseline = "top";
    ctx.drawImage(this.video, 0, 0, 300, 300);
    //console.log("predictions are: ");
    this.handlePredictions(predictions);
    predictions.forEach(prediction => {
      //console.log(prediction.class);
      const x = prediction.bbox[0];
      const y = prediction.bbox[1];
      const width = prediction.bbox[2];
      const height = prediction.bbox[3];
      // Draw the bounding box.
      ctx.strokeStyle = "#00FFFF";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
      // Draw the label background.
      ctx.fillStyle = "#00FFFF";
      const textWidth = ctx.measureText(prediction.class).width;
      const textHeight = parseInt(font, 10); // base 10
      ctx.fillRect(x, y, textWidth + 4, textHeight + 4);
    });

    predictions.forEach(prediction => {
      const x = prediction.bbox[0];
      const y = prediction.bbox[1];
      // Draw the text last to ensure it's on top.
      ctx.fillStyle = "#000000";
      ctx.fillText(prediction.class, x, y);
    });
  };
}
