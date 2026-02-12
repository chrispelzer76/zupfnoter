import { Component } from '@angular/core';
import { AppShellComponent } from './components/app-shell/app-shell';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppShellComponent],
  template: `<app-shell />`,
  styles: [`:host { display: block; height: 100%; }`],
})
export class App {}
