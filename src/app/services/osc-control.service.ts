import { Injectable } from '@angular/core';
import { OscService } from './osc.service';
import { OSCBoolValue, OSCIntValue, OSCMessage } from '../models/osc-message';
import { SleepService } from './sleep.service';
import { OpenVRService } from './openvr.service';
import { combineLatest, debounceTime, firstValueFrom, map, startWith, Subject, tap } from 'rxjs';
import { AutomationConfigService } from './automation-config.service';
import { info } from 'tauri-plugin-log-api';
import { LighthouseService } from './lighthouse.service';

const ADDRESS_CMD = '/avatar/parameters/Oyasumi/Cmd';
const ADDRESS_SLEEP_MODE = '/avatar/parameters/Oyasumi/SleepMode';
const ADDRESS_SLEEPING_ANIMATIONS = '/avatar/parameters/Oyasumi/SleepingAnimations';
const ADDRESS_STATUS_AUTOMATIONS = '/avatar/parameters/Oyasumi/StatusAutomations';

@Injectable({
  providedIn: 'root',
})
export class OscControlService {
  private syncParameters: Subject<void> = new Subject<void>();
  private sleepingAnimations = false;
  private statusAutomations = false;
  private sleepMode = false;

  constructor(
    private osc: OscService,
    private sleep: SleepService,
    private openvr: OpenVRService,
    private automationConfig: AutomationConfigService,
    private lighthouse: LighthouseService
  ) {}

  async init() {
    this.osc.messages.subscribe((message) => {
      this.handleOSCMessage(message);
    });
    await this.setupParameterSync();
  }

  async setupParameterSync() {
    combineLatest([
      this.sleep.mode,
      this.automationConfig.configs.pipe(map((configs) => configs.SLEEPING_ANIMATIONS.enabled)),
      this.automationConfig.configs.pipe(
        map((configs) => configs.CHANGE_STATUS_BASED_ON_PLAYER_COUNT.enabled)
      ),
      this.syncParameters.pipe(startWith(undefined)),
    ])
      .pipe(
        tap(([sleepMode, sleepingAnimations, statusAutomations]) => {
          this.sleepMode = sleepMode;
          this.sleepingAnimations = sleepingAnimations;
          this.statusAutomations = statusAutomations;
        }),
        debounceTime(0)
      )
      .subscribe(([sleepMode, sleepingAnimations, statusAutomations]) => {
        this.osc.send_bool(ADDRESS_SLEEP_MODE, sleepMode);
        this.osc.send_bool(ADDRESS_SLEEPING_ANIMATIONS, sleepingAnimations);
        this.osc.send_bool(ADDRESS_STATUS_AUTOMATIONS, statusAutomations);
      });
  }

  private async handleCommand(command: number) {
    switch (command) {
      case 1: // Initialize
        this.syncParameters.next();
        await this.osc.send_int(ADDRESS_CMD, 0);
        break;
      case 2: // All Trackers
        await this.lighthouse.turnOffDevices(
          (await firstValueFrom(this.openvr.devices)).filter((d) => d.class === 'GenericTracker')
        );
        break;
      case 3: // All Controllers
        setTimeout(async () => {
          await this.lighthouse.turnOffDevices(
            (await firstValueFrom(this.openvr.devices)).filter((d) => d.class === 'Controller')
          );
        }, 2000);
        break;
      case 4: // All Devices
        setTimeout(async () => {
          await this.lighthouse.turnOffDevices(await firstValueFrom(this.openvr.devices));
        }, 2000);
        break;
    }
  }

  private async handleOSCMessage(message: OSCMessage) {
    switch (message.address) {
      case '/avatar/change':
        this.syncParameters.next();
        break;
      case ADDRESS_CMD:
        const { value } = message.values[0] as OSCIntValue;
        await this.handleCommand(value);
        break;
      case ADDRESS_SLEEP_MODE: {
        const { value: enable } = message.values[0] as OSCBoolValue;
        if (this.sleepMode === enable) return;
        if (enable) {
          info('[OSCControl] Activating sleep mode');
          await this.sleep.enableSleepMode({ type: 'OSC_CONTROL' });
        } else {
          info('[OSCControl] Deactivating sleep mode');
          await this.sleep.disableSleepMode({ type: 'OSC_CONTROL' });
        }
        break;
      }
      case ADDRESS_SLEEPING_ANIMATIONS: {
        const { value: enable } = message.values[0] as OSCBoolValue;
        if (this.sleepingAnimations === enable) return;
        if (enable) info('[OSCControl] Enabling sleeping animation automations');
        else info('[OSCControl] Disabling sleeping animation automations');
        await this.automationConfig.updateAutomationConfig('SLEEPING_ANIMATIONS', {
          enabled: enable,
        });
        break;
      }
      case ADDRESS_STATUS_AUTOMATIONS: {
        const { value: enable } = message.values[0] as OSCBoolValue;
        if (this.statusAutomations === enable) return;
        if (enable) info('[OSCControl] Enabling status automations');
        else info('[OSCControl] Disabling status automations');
        await this.automationConfig.updateAutomationConfig('CHANGE_STATUS_BASED_ON_PLAYER_COUNT', {
          enabled: enable,
        });
        break;
      }
    }
  }
}
