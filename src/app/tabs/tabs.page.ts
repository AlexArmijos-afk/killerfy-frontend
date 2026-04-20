import { Component } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton,
         IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { home, search, person } from 'ionicons/icons';
import { MiniPlayerComponent } from '../components/mini-player/mini-player.component';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, MiniPlayerComponent]
})
export class TabsPage {
  constructor() {
    addIcons({ home, search, person });
  }
}