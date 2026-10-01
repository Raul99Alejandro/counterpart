import { PollyClient, SynthesizeSpeechCommand, type Engine, type VoiceId } from '@aws-sdk/client-polly';

/** Text to MP3. The demo page plays it as Alexa's voice instead of the browser's own speech. */
export type Speaker = (text: string) => Promise<Uint8Array>;

/** Amazon Polly. The neural engine by default: fast enough for a spoken turn. */
export function pollySpeaker(client: PollyClient, voiceId: string, engine: string = 'neural'): Speaker {
  return async text => {
    const out = await client.send(new SynthesizeSpeechCommand({
      Text: text, VoiceId: voiceId as VoiceId, Engine: engine as Engine, OutputFormat: 'mp3', SampleRate: '24000'
    }));
    if (!out.AudioStream) throw new Error('empty reply from Polly');
    return out.AudioStream.transformToByteArray();
  };
}
