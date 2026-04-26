"use client";

import { useState } from "react";
import { onboardingFlow } from "@/lib/demo-data";

export function OnboardingFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = onboardingFlow[stepIndex];
  const progress = ((stepIndex + 1) / onboardingFlow.length) * 100;

  return (
    <div className="panel glass step-shell">
      <div className="step-progress" aria-label="Onboarding progress">
        {onboardingFlow.map((step, index) => (
          <span
            className={`step-dot ${index === stepIndex ? "active" : ""}`}
            key={step.id}
          />
        ))}
      </div>

      <div className="progress-bar" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="question-card">
        <div className="question-meta">
          <span className="tag">
            第 {currentStep.step} 步 · {currentStep.label}
          </span>
          <h2>{currentStep.title}</h2>
          <p>{currentStep.description}</p>
        </div>

        <div className="question-cluster">
          {currentStep.fields.map((field) => (
            <div className="input-group" key={field.key}>
              <label htmlFor={field.key}>{field.label}</label>
              <textarea id={field.key} rows={4} placeholder={field.placeholder} />
            </div>
          ))}
        </div>

        <div className="question-actions">
          <button
            className="button-secondary"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            type="button"
          >
            上一步
          </button>
          <button
            className="button-primary"
            onClick={() =>
              setStepIndex((value) =>
                Math.min(onboardingFlow.length - 1, value + 1)
              )
            }
            type="button"
          >
            {stepIndex === onboardingFlow.length - 1 ? "保存" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
