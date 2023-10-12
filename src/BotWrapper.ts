import { ChildProcess, spawn } from "child_process";
import { BotConfig } from "./common";
import { Writable } from "stream";
import { notNull } from "./utils";

export class Bot {
  error?: Error;
  process: ChildProcess;
  std_out: string[] = [];
  std_err: string[] = [];
  available_time: number;
  stdin: Writable;

  private static readonly starting_available_time: number = 1000; // in ms
  private static readonly plus_time_per_round: number = 30; // in ms

  public constructor(
    readonly id: string,
    readonly name: string,
    readonly index: number,
    command: string,
  ) {
    this.available_time = Bot.starting_available_time;

    this.process = spawn(`${command}`, []);
    this.process.on("error", (error) => {
      if (!this.error) this.error = error;
      console.error(`Bot ${id} (#${index}) error: ${error.message}`);
    });

    if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
      const pipeError = new Error("process IO not not piped");
      if (!this.error) this.error = pipeError;
      throw pipeError;
    }
    this.stdin = this.process.stdin;
    this.process.stdout.on("data", this.processData.bind(this));
    this.process.stderr.on("data", (data) => this.std_err.push(data));

    this.process.on("close", () => {
      const message = `Bot ${id} (#${index}) stdio closed`;
      if (!this.error) this.error = new Error(message);
      console.error(message);
    });

    this.process.on("exit", (code) => {
      const message = `Bot ${id} (#${index}) exited with code ${code}`;
      if (!this.error) this.error = new Error(message);
      console.error(message);
    });
  }

  private processData(data: Buffer) {
    data
      .toString()
      .split("\n")
      .map((s: string) => s.trim())
      .filter((s: string) => s !== "")
      .forEach((s: string) => this.std_out.push(s));
  }

  public send(message: string) {
    if (this.error) throw this.error;

    return new Promise<boolean>((resolve) => {
      this.stdin.write(message + "\n", (error) => {
        if (error) {
          if (!this.error) this.error = error;
          console.error(`Bot ${this.id} (#${this.index}) write error: ${error.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
      this.stdin.emit("drain");
    });
  }

  public async ask(number_of_lines = 1): Promise<
    | { data: string; error: undefined }
    | {
        data: string | null;
        error: Error;
      }
  > {
    if (this.error) throw this.error;
    this.available_time += Bot.plus_time_per_round;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (this.std_out.length < number_of_lines && this.available_time > 0 && !this.error) {
      this.available_time -= 10;
      await delay(10);
    }

    const data = this.std_out.length ? this.std_out.splice(0, number_of_lines).join("\n") : null;
    // We don't want to set this.error = TLE and thus drop the player after a single timeout.
    // Maybe after X rounds of continuous timeout, if we want to be that smart.
    const error = this.error
      ? this.error
      : this.available_time <= 0
      ? new Error("Bot ${this.id} (#${this.index}): response time limit exceeded")
      : undefined;
    return error ? { data, error } : { data: notNull(data), error };
  }

  public kill(signal?: NodeJS.Signals | number) {
    return this.process.kill(signal);
  }

  public stop() {
    this.stdin.end();
    this.kill();
  }

  public debug(): void {
    console.log(this.std_out);
  }
}

export class BotPool {
  public bots: Bot[];

  public constructor(bot_configs: BotConfig[]) {
    this.bots = bot_configs.map(
      ({ id, name, runCommand }, index) => new Bot(id, name, index, runCommand),
    );
  }

  public sendAll(message: string) {
    return Promise.all(this.bots.map((b) => b.send(message)));
  }

  public askAll(number_of_lines = 1) {
    return Promise.all(this.bots.map((b) => b.ask(number_of_lines)));
  }

  public killAll(signal?: NodeJS.Signals | number) {
    for (const bot of this.bots) bot.kill(signal);
  }

  public stopAll() {
    for (const bot of this.bots) bot.stop();
  }
}
