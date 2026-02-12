import { Component, input, output } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ViewPerspective } from '../app-shell/app-shell';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatButtonToggleModule, MatMenuModule, MatTooltipModule,
  ],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent {
  currentExtract = input(0);
  viewPerspective = input<ViewPerspective>('all');
  statusMessage = input('');
  isPlaying = input(false);

  render = output<void>();
  extractChange = output<number>();
  viewChange = output<ViewPerspective>();
  toggleConfig = output<void>();
  printA3 = output<void>();
  printA4 = output<void>();
  play = output<void>();
  stopPlay = output<void>();
  speedChange = output<number>();

  extracts = [0, 1, 2, 3, 4, 5];
  speeds = [
    { label: '0.5x', value: 0.5 },
    { label: '1x', value: 1 },
    { label: '1.5x', value: 1.5 },
    { label: '2x', value: 2 },
  ];

  onRender(): void {
    this.render.emit();
  }

  onExtractChange(value: string): void {
    this.extractChange.emit(Number(value));
  }

  onViewChange(value: string): void {
    this.viewChange.emit(value as ViewPerspective);
  }

  onToggleConfig(): void {
    this.toggleConfig.emit();
  }

  onPrintA3(): void {
    this.printA3.emit();
  }

  onPrintA4(): void {
    this.printA4.emit();
  }

  onPlayStop(): void {
    if (this.isPlaying()) {
      this.stopPlay.emit();
    } else {
      this.play.emit();
    }
  }

  onSpeedChange(speed: number): void {
    this.speedChange.emit(speed);
  }
}
