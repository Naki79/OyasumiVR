import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { getVersion } from '../../../../utils/app-utils';
import { BackgroundService } from '../../../../services/background.service';
import { BUILD_ID, FLAVOUR } from '../../../../../build';
import { CachedValue } from '../../../../utils/cached-value';
import { filter, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getClient } from '@tauri-apps/api/http';
import { vshrink } from '../../../../utils/animations';

interface SupporterTier {
  name: string;
  supporters: string[];
}

@Component({
  selector: 'app-about-view',
  templateUrl: './about-view.component.html',
  styleUrls: ['./about-view.component.scss'],
  animations: [vshrink()],
})
export class AboutViewComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly FLAVOUR = FLAVOUR;
  private supportersScrolling = false;

  version?: string;

  @ViewChild('supportersList') supportersList?: ElementRef;

  protected supporterCache: CachedValue<SupporterTier[]> = new CachedValue<SupporterTier[]>(
    undefined,
    60 * 60 * 1000, // Cache for 1 hour
    'OYASUMIVR_SUPPORTERS'
  );

  constructor(private background: BackgroundService, private destroyRef: DestroyRef) {}

  async ngOnInit() {
    this.version = await getVersion();
    this.background.setBackground('/assets/img/about_bg.jpg');
    await this.supporterCache.waitForInitialisation();
    // Fetch supporters list if we don't have it yet (or if the cache expired)
    if (this.supporterCache.get() === undefined) {
      try {
        const client = await getClient();
        const response = await client.get<{ [tier: string]: string[] }>(
          'https://europe-west1-oyasumivr.cloudfunctions.net/getSupporters'
        );
        if (response.ok) {
          const supporters = response.data;
          await this.supporterCache.set(
            Object.entries(supporters).map((entry) => ({
              name: entry[0],
              supporters: entry[1],
            }))
          );
        }
      } catch (e) {
        // Ignore failure, we'll just not show the list.
      }
    }
  }

  async ngAfterViewInit() {
    interval(1000)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(() => !this.supportersScrolling)
      )
      .subscribe(() => {
        if (!this.supportersList) return;
        const list = this.supportersList.nativeElement as HTMLDivElement;
        if (list.scrollWidth <= list.clientWidth) return;
        this.supportersScrolling = true;
        const scrollToEnd = () => {
          if (!this.supportersScrolling) {
            list.scrollLeft = 0;
            list.style.opacity = '100%';
            return;
          }
          list.scrollLeft += 0.5;
          if (list.scrollLeft < list.scrollWidth - list.clientWidth) {
            requestAnimationFrame(() => scrollToEnd());
          } else {
            setTimeout(() => {
              list.style.opacity = '0%';
            }, 1500);
            setTimeout(() => {
              list.scrollLeft = 0;
              list.style.opacity = '100%';
              setTimeout(() => requestAnimationFrame(() => scrollToEnd()), 2000);
            }, 2000);
          }
        };
        setTimeout(() => requestAnimationFrame(() => scrollToEnd()), 2000);
      });
  }

  async ngOnDestroy() {
    this.background.setBackground(null);
  }

  protected readonly BUILD_ID = BUILD_ID;
}
