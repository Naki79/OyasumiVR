import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api';
import { message } from '@tauri-apps/api/dialog';
import { exit } from '@tauri-apps/api/process';
import { OpenVRService } from './openvr.service';
import { pairwise } from 'rxjs';
import { SleepService } from './sleep.service';

@Injectable({
  providedIn: 'root',
})
export class OscService {
  address = '127.0.0.1:9000';

  constructor(private sleep: SleepService) {}

  async footLockUnlock() {
    const sleep = (duration: number) =>
      new Promise((res, rej) => setTimeout(() => res(void 0), duration));
    await sleep(10);
    await this.send_bool('/avatar/parameters/VRCFootAnchor', false);
    await sleep(600);
    await this.send_bool('/avatar/parameters/VRCFootAnchor', true);
  }

  async init() {
    const result = await invoke<boolean>('osc_init');
    if (!result) {
      await message(
        'Could not bind a UDP socket to interact with VRChat over OSC. Please give Oyasumi the correct permissions.',
        { type: 'error', title: 'Oyasumi' }
      );
      await exit(0);
    }
  }

  async send_float(address: string, value: number) {
    await invoke('osc_send_float', { addr: this.address, oscAddr: address, data: value });
  }

  async send_int(address: string, value: number) {
    await invoke('osc_send_int', { addr: this.address, oscAddr: address, data: value });
  }

  async send_bool(address: string, value: boolean) {
    await invoke('osc_send_bool', { addr: this.address, oscAddr: address, data: value });
  }
}
