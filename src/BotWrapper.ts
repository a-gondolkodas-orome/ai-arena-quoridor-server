import { ChildProcess, spawn } from "child_process";
import { BotConfig } from "./common";
import { Writable } from "stream";
import { notNull } from "./utils";

export class BotError extends Error {
  constructor(
    readonly bot: {
      id: string;
      name: string;
      index: number;
    },
    message: string,
  ) {
    super(message);
  }
}

export class Bot {
  error?: BotError;
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
    this.bot = { id, name, index };
    this.available_time = Bot.starting_available_time;

    this.process = spawn(`${command}`, []);
    this.process.on("error", (error) => {
      this.setBotError(new BotError(this.bot, "process error: " + error.message));
    });

    if (this.process.stdin && this.process.stdout && this.process.stderr) {
      this.stdin = this.process.stdin;
      this.process.stdin.on("error", (error) => {
        this.setBotError(new BotError(this.bot, "write error: " + error.message));
      });
      this.process.stdout.on("error", (error) => {
        this.setBotError(new BotError(this.bot, "read error: " + error.message));
      });
      this.process.stdout.on("data", this.processData.bind(this));
      this.process.stderr.on("data", (data) => this.std_err.push(data));
    } else {
      this.setBotError(new BotError(this.bot, "process IO not not piped"));
    }

    this.process.on("close", () => {
      this.setBotError(new BotError(this.bot, "stdio closed"));
    });

    this.process.on("exit", (code) => {
      this.setBotError(new BotError(this.bot, `exited with code ${code}`));
    });
  }

  protected bot: { id: string; name: string; index: number };

  private processData(data: Buffer) {
    data
      .toString()
      .split("\n")
      .map((s: string) => s.trim())
      .filter((s: string) => s !== "")
      .forEach((s: string) => this.std_out.push(s));
  }

  public send(message: string) {
    if (this.error)
      throw new BotError(this.bot, "Send failed, already in error state: " + this.error.message);

    return new Promise<void>((resolve, reject) => {
      try {
        this.stdin.write(message + "\n", (error) => {
          if (error) {
            this.setBotError(new BotError(this.bot, "write error: " + error.message));
            reject(this.error);
          } else {
            resolve();
          }
        });
      } catch (error) {
        this.setBotError(
          new BotError(
            {
              id: this.id,
              name: this.name,
              index: this.index,
            },
            "write error: " + error.message,
          ),
        );
        reject(this.error);
      }
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
      ? new BotError(
          { id: this.id, name: this.name, index: this.index },
          "response time limit exceeded",
        )
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

  protected setBotError(error: BotError) {
    console.error(
      `Bot ${error.bot.name} (index: #${error.bot.index}, id: ${error.bot.id}): ${error.message}`,
    );
    if (!this.error) this.error = error;
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
