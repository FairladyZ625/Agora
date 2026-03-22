# Output Skeleton

## Example

```text
my-nomos/
  profile.toml
  README.md
  constitution/
    constitution.md
  docs/
    reference/
      README.md
      methodologies.md
      governance.md
  lifecycle/
    project-bootstrap.md
    task-closeout.md
  prompts/
    bootstrap/
      interview.md
    closeout/
      review.md
```

## Minimum completion bar

The generated pack should let another agent answer:

- What is this Nomos for?
- What files are required after install?
- What lifecycle modules does it drive?
- What does bootstrap ask?
- What does closeout ask?

If those answers are not obvious from the pack, the output is not complete enough.
