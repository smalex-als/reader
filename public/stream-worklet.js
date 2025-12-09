class StreamPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data.type !== 'string') {
        return;
      }
      if (data.type === 'append' && data.payload instanceof ArrayBuffer) {
        const incoming = new Float32Array(data.payload);
        const merged = new Float32Array(this.buffer.length + incoming.length);
        merged.set(this.buffer, 0);
        merged.set(incoming, this.buffer.length);
        this.buffer = merged;
      } else if (data.type === 'reset') {
        this.buffer = new Float32Array(0);
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }
    const frames = output.length;
    let silent = false;

    if (this.buffer.length === 0) {
      output.fill(0);
      silent = true;
    } else if (this.buffer.length <= frames) {
      output.set(this.buffer);
      if (this.buffer.length < frames) {
        output.fill(0, this.buffer.length);
      }
      this.buffer = new Float32Array(0);
    } else {
      output.set(this.buffer.subarray(0, frames));
      this.buffer = this.buffer.subarray(frames);
    }

    this.port.postMessage({ type: 'played', frames, silent });
    return true;
  }
}

registerProcessor('stream-player', StreamPlayerProcessor);
